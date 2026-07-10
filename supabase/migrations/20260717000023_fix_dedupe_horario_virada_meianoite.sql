-- ============================================================
-- Sabor & Cia — 023 Corrige dedupe de vai_abrir/vai_fechar que
-- cruza a meia-noite (Rodada 5, item 3)
--
-- Diagnóstico (checado direto no banco remoto, sem forçar patch às
-- cegas): pg_cron roda a cada 1 min sem falhas (cron.job_run_details),
-- a sessão do banco já está em America/Sao_Paulo desde a migration
-- 012, e notificacoes já está na publication supabase_realtime desde
-- a 019 — nenhum desses três é a causa.
--
-- A causa real é no DEDUPE de 019. O índice único usava
-- dia_sao_paulo(criado_em) — a data-calendário pura. Unidades que
-- fecham na madrugada (ex.: Pinheiros 18:00–02:00) podem ter a janela
-- de 30 min antes de fechar cruzando a virada (ex.: fechamento às
-- 00:10 → janela 23:40–00:10). O trecho antes da meia-noite grava com
-- a data de "ontem"; o trecho depois grava com a data de "hoje" —
-- datas diferentes na mesma chave de dedupe (profile_id, unidade_id,
-- tipo, dia) não colidem, e o MESMO fechamento pode gerar duas
-- notificações em vez de uma.
--
-- Correção: em vez da data-calendário, usar o "dia operacional" —
-- desloca o corte 4h pra trás (04:00 da manhã, hora morta pra
-- qualquer unidade do cardápio) antes de truncar pra date. Os dois
-- lados da meia-noite caem no mesmo balde quando a janela de 30 min
-- cruza a virada.
--
-- Também extrai o cálculo de abertura/fechamento (antes inline no
-- loop de gerar_notificacoes()) pra uma função pura e determinística
-- — calcula_virada_horario() — pra poder testar os casos de virada
-- (30 min, 23:00→02:00) direto em validate-sql.mjs sem depender da
-- hora real em que o teste roda.
-- ============================================================

create or replace function dia_operacional_sao_paulo(ts timestamptz)
returns date
language sql
immutable
as $$
  select ((ts at time zone 'America/Sao_Paulo') - interval '4 hours')::date;
$$;

drop index uniq_notificacao_horario;

create unique index uniq_notificacao_horario
  on notificacoes (profile_id, unidade_id, tipo, dia_operacional_sao_paulo(criado_em))
  where tipo in ('vai_abrir', 'vai_fechar');

comment on function dia_sao_paulo(timestamptz) is
  'Substituída por dia_operacional_sao_paulo() no dedupe de vai_abrir/vai_fechar (023) — mantida só por compatibilidade, sem uso ativo.';

-- Cálculo puro de virada: dado horário de abertura/fechamento de uma
-- unidade e o horário atual (todos `time`, sem fuso — o chamador já
-- resolve isso), devolve se está aberta, o tipo de evento (vai_abrir
-- ou vai_fechar) e quantos minutos faltam pra virada. tipo_evento nulo
-- = unidade 24h (abre = fecha), nunca "vai virar".
create or replace function calcula_virada_horario(
  p_abertura time,
  p_fechamento time,
  p_agora time
)
returns table (aberta boolean, tipo_evento tipo_notificacao, minutos_restantes int)
language plpgsql
immutable
as $$
declare
  agora_min int := extract(hour from p_agora)::int * 60 + extract(minute from p_agora)::int;
  abre_min int := extract(hour from p_abertura)::int * 60 + extract(minute from p_abertura)::int;
  fecha_min int := extract(hour from p_fechamento)::int * 60 + extract(minute from p_fechamento)::int;
  v_aberta boolean;
  v_tipo tipo_notificacao;
  v_minutos int;
begin
  if fecha_min = abre_min then
    return query select true, null::tipo_notificacao, null::int;
    return;
  elsif fecha_min > abre_min then
    v_aberta := agora_min >= abre_min and agora_min < fecha_min;
  else
    -- fechamento depois da meia-noite (ex.: 18:00–02:00)
    v_aberta := agora_min >= abre_min or agora_min < fecha_min;
  end if;

  if v_aberta then
    v_tipo := 'vai_fechar';
    v_minutos := case when fecha_min > agora_min
      then fecha_min - agora_min
      else (24 * 60 - agora_min) + fecha_min end;
  else
    v_tipo := 'vai_abrir';
    v_minutos := case when abre_min > agora_min
      then abre_min - agora_min
      else (24 * 60 - agora_min) + abre_min end;
  end if;

  return query select v_aberta, v_tipo, v_minutos;
end;
$$;

create or replace function gerar_notificacoes()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  dest record;
  virada record;
begin
  -- 1) Auto-cancel: 'recebido' há mais que o tempo_limite_aceite_min
  --    configurado da própria unidade (default 5 min).
  for r in
    select p.id, p.codigo, p.unidade_id, u.tempo_limite_aceite_min
    from pedidos p
    join unidades u on u.id = p.unidade_id
    where p.status = 'recebido'
      and p.data_pedido < now() - (u.tempo_limite_aceite_min || ' minutes')::interval
  loop
    update pedidos set status = 'cancelado' where id = r.id;
    -- log_cancelamentos já é populado pelo trigger existente (003).

    for dest in select * from destinatarios_unidade(r.unidade_id) loop
      perform notificar(
        dest.profile_id,
        r.unidade_id,
        'pedido_cancelado_auto',
        'Pedido cancelado automaticamente',
        format('Pedido %s cancelado — não aceito em %s min', r.codigo, r.tempo_limite_aceite_min),
        r.id
      );
    end loop;
  end loop;

  -- 2) Atrasado: 'preparando' há mais que o limite_atraso_min da
  --    unidade (default 20 min) — uma vez por pedido, via dedupe.
  for r in
    select p.id, p.codigo, p.unidade_id, u.limite_atraso_min
    from pedidos p
    join unidades u on u.id = p.unidade_id
    where p.status = 'preparando'
      and p.preparando_em is not null
      and p.preparando_em < now() - (u.limite_atraso_min || ' minutes')::interval
  loop
    for dest in select * from destinatarios_unidade(r.unidade_id) loop
      perform notificar(
        dest.profile_id,
        r.unidade_id,
        'pedido_atrasado',
        'Pedido atrasado',
        format('Pedido %s passou do limite de atraso de %s min', r.codigo, r.limite_atraso_min),
        r.id
      );
    end loop;
  end loop;

  -- 3) Vai abrir / vai fechar: unidades ativas a ≤30 min da virada.
  --    now()::time já reflete America/Sao_Paulo — o timezone da sessão
  --    do banco foi fixado nesse fuso na migration 012, então não
  --    precisa converter nada aqui.
  for r in
    select id, nome, horario_abertura, horario_fechamento
    from unidades
    where status = 'ativa'
  loop
    select v.aberta, v.tipo_evento, v.minutos_restantes
    into virada
    from calcula_virada_horario(r.horario_abertura, r.horario_fechamento, now()::time) v;

    if virada.tipo_evento is null then
      continue; -- 24h, nunca "vai virar"
    end if;

    if virada.minutos_restantes <= 30 then
      for dest in select * from destinatarios_unidade(r.id) loop
        perform notificar(
          dest.profile_id,
          r.id,
          virada.tipo_evento,
          case when virada.tipo_evento = 'vai_fechar' then r.nome || ' vai fechar' else r.nome || ' vai abrir' end,
          case when virada.tipo_evento = 'vai_fechar'
            then format('%s fecha em %s min', r.nome, virada.minutos_restantes)
            else format('%s abre em %s min', r.nome, virada.minutos_restantes) end
        );
      end loop;
    end if;
  end loop;
end;
$$;

revoke execute on function gerar_notificacoes() from public, anon, authenticated;
