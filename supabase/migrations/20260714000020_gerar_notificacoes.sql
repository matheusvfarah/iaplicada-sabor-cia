-- ============================================================
-- Sabor & Cia — 020 Notificações (Fase 2 — geração server-side)
--
-- Tudo nasce no banco; o frontend só lê. gerar_notificacoes() cobre
-- os 3 casos baseados em tempo (auto-cancel, atrasado, vai abrir/vai
-- fechar) e é agendada via pg_cron a cada 1 min. "Pedido novo" é
-- evento, não tempo, então é um trigger separado.
-- ============================================================

-- Helper: insere respeitando os índices únicos parciais de dedupe
-- (Fase 1) — ON CONFLICT DO NOTHING sem especificar alvo funciona
-- porque os dois índices parciais cobrem conjuntos de `tipo`
-- disjuntos, então no máximo um se aplica a cada linha.
create or replace function notificar(
  p_profile_id uuid,
  p_unidade_id bigint,
  p_tipo tipo_notificacao,
  p_titulo text,
  p_mensagem text,
  p_ref_pedido_id bigint default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into notificacoes (profile_id, unidade_id, tipo, titulo, mensagem, ref_pedido_id)
  values (p_profile_id, p_unidade_id, p_tipo, p_titulo, p_mensagem, p_ref_pedido_id)
  on conflict do nothing;
end;
$$;

-- Destinatários de uma unidade: os gerentes DAQUELA unidade + todos
-- os gestores de rede (eles enxergam tudo).
create or replace function destinatarios_unidade(p_unidade_id bigint)
returns table (profile_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select id from profiles
  where (role = 'gerente' and unidade_id = p_unidade_id)
     or role = 'gestor_geral';
$$;

-- Função principal, agendada a cada 1 min (ou chamada pelo n8n —
-- ver nota de fallback no fim do arquivo).
create or replace function gerar_notificacoes()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  dest record;
  agora_min int;
  abre_min int;
  fecha_min int;
  aberta boolean;
  minutos_restantes int;
  tipo_evento tipo_notificacao;
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
    agora_min := extract(hour from now()::time)::int * 60 + extract(minute from now()::time)::int;
    abre_min := extract(hour from r.horario_abertura)::int * 60 + extract(minute from r.horario_abertura)::int;
    fecha_min := extract(hour from r.horario_fechamento)::int * 60 + extract(minute from r.horario_fechamento)::int;

    if fecha_min = abre_min then
      aberta := true; -- 24h, nunca "vai virar"
      continue;
    elsif fecha_min > abre_min then
      aberta := agora_min >= abre_min and agora_min < fecha_min;
    else
      -- fechamento depois da meia-noite (ex.: 18:00–02:00)
      aberta := agora_min >= abre_min or agora_min < fecha_min;
    end if;

    if aberta then
      tipo_evento := 'vai_fechar';
      minutos_restantes := case when fecha_min > agora_min
        then fecha_min - agora_min
        else (24 * 60 - agora_min) + fecha_min end;
    else
      tipo_evento := 'vai_abrir';
      minutos_restantes := case when abre_min > agora_min
        then abre_min - agora_min
        else (24 * 60 - agora_min) + abre_min end;
    end if;

    if minutos_restantes <= 30 then
      for dest in select * from destinatarios_unidade(r.id) loop
        perform notificar(
          dest.profile_id,
          r.id,
          tipo_evento,
          case when tipo_evento = 'vai_fechar' then r.nome || ' vai fechar' else r.nome || ' vai abrir' end,
          case when tipo_evento = 'vai_fechar'
            then format('%s fecha em %s min', r.nome, minutos_restantes)
            else format('%s abre em %s min', r.nome, minutos_restantes) end
        );
      end loop;
    end if;
  end loop;
end;
$$;

revoke execute on function gerar_notificacoes() from public, anon, authenticated;

-- 4) Pedido novo: dispara quando um pedido passa a existir como
--    'recebido' — tanto por INSERT direto (dados de demo/seed) quanto
--    por UPDATE (fluxo real: pendente -> recebido pelo aceite do
--    popup). Um trigger só de "after insert" perderia o caminho real
--    de chegada (a transição pendente->recebido é um UPDATE) e ainda
--    inundaria notificação em cada reseed de dado histórico — por
--    isso a condição é sobre o estado resultante, não a operação.
create or replace function notificar_pedido_novo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  dest record;
begin
  if new.status = 'recebido' and (tg_op = 'INSERT' or old.status is distinct from 'recebido') then
    -- só os gerentes da unidade — o gestor acompanha pelo badge da
    -- sidebar, não pelo sino (ver Fase 3).
    for dest in
      select pr.id as profile_id
      from profiles pr
      where pr.role = 'gerente' and pr.unidade_id = new.unidade_id
    loop
      perform notificar(
        dest.profile_id,
        new.unidade_id,
        'pedido_novo',
        'Pedido novo',
        format('Pedido %s chegou — %s', new.codigo, new.plataforma::text),
        new.id
      );
    end loop;
  end if;
  return new;
end;
$$;

create trigger on_pedido_recebido
  after insert or update of status on pedidos
  for each row execute function notificar_pedido_novo();

-- Agendamento -----------------------------------------------------
-- pg_cron: disponível nos planos pagos do Supabase (Pro+) via
-- Database > Extensions. Se a extensão não existir no projeto (plano
-- Free, ou ambiente local), o bloco abaixo não falha a migration —
-- só não agenda nada — e o fallback é chamar rpc/gerar_notificacoes
-- (exposta como RPC) por um workflow do n8n agendado a cada 1 min
-- (Schedule Trigger -> HTTP Request/Postgres node chamando
-- `select gerar_notificacoes();`).
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;

    if not exists (select 1 from cron.job where jobname = 'gerar_notificacoes') then
      perform cron.schedule('gerar_notificacoes', '* * * * *', 'select gerar_notificacoes();');
    end if;
  end if;
end $$;
