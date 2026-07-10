-- ============================================================
-- Sabor & Cia — 026 Aceite do popup vai direto pra produção
--
-- Pedidos agora só nascem via API (n8n) — a fila de "pendente" no
-- popup é a única forma de decisão do gerente. Aceitar deixava de
-- passar pela coluna "Recebidos" e ainda exigia um segundo clique
-- (Aceitar de novo, lá no kanban) pra entrar em produção de verdade;
-- agora aceitar no popup já move direto pra 'preparando'.
--
-- 1) Libera a transição pendente -> preparando (011 só permitia
--    pendente -> recebido/cancelado). Mantém pendente -> recebido
--    disponível por compatibilidade, mesmo sem nenhum caminho do
--    produto usando mais — não faz mal deixar.
-- 2) notificar_pedido_novo() (020) disparava em cima de 'recebido' —
--    com o aceite pulando esse status, a notificação de "pedido novo"
--    nunca mais dispararia no fluxo real. Passa a disparar quando o
--    pedido chega em 'preparando', que é o estado que agora marca a
--    chegada de verdade na operação da cozinha.
-- ============================================================

create or replace function validar_transicao_pedido()
returns trigger
language plpgsql
as $$
begin
  if new.status is distinct from old.status then
    if not (
      (old.status = 'pendente' and new.status in ('recebido', 'preparando', 'cancelado')) or
      (old.status = 'recebido' and new.status in ('preparando', 'cancelado')) or
      (old.status = 'preparando' and new.status in ('entregue', 'cancelado'))
    ) then
      raise exception 'transição de status inválida: % -> %', old.status, new.status;
    end if;
  end if;

  if new.status = 'preparando' and new.preparando_em is null then
    new.preparando_em := now();
  end if;
  if new.status = 'entregue' and new.entregue_em is null then
    new.entregue_em := now();
  end if;

  return new;
end;
$$;

create or replace function notificar_pedido_novo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  dest record;
begin
  if new.status = 'preparando' and (tg_op = 'INSERT' or old.status is distinct from 'preparando') then
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
