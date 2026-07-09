-- ============================================================
-- Sabor & Cia — 011 Módulo operacional da unidade (Fase 1)
--
-- Mantém os dois estágios já existentes: 'pendente' (chegada do
-- pedido simulado, aceite/recusa via popup — migrations 005-007)
-- e agora recebido→preparando→entregue/cancelado, operado pelo
-- kanban da página Pedidos.
--
-- Reaproveita produtos/pedido_itens já criados (006) em vez de
-- criar cardapio_itens/pedido_itens duplicados — só adiciona as
-- colunas que faltavam (categoria, descricao).
-- ============================================================

-- Timestamps de produção + código curto -------------------------
alter table pedidos
  add column preparando_em timestamptz,
  add column entregue_em timestamptz,
  add column codigo text generated always as ('#' || upper(to_hex(id))) stored;

-- Cardápio: categoria/descrição -----------------------------------
alter table produtos
  add column categoria text,
  add column descricao text;

-- Gerente só pode alterar disponibilidade do cardápio, nunca preço
-- ou nome — restrição por coluna, já que RLS não diferencia colunas.
revoke update on produtos from authenticated;
grant update (disponivel) on produtos to authenticated;

-- Transições de status válidas + timestamps automáticos -----------
-- pendente→recebido/cancelado já é tratado pelas policies 006.
-- Este trigger valida o restante da esteira (recebido→preparando→
-- entregue, cancelamento a qualquer momento antes de entregue) e
-- é a fonte de verdade das transições — mais confiável que policy,
-- que não enxerga claramente o old.status.
create or replace function validar_transicao_pedido()
returns trigger
language plpgsql
as $$
begin
  if new.status is distinct from old.status then
    if not (
      (old.status = 'pendente' and new.status in ('recebido', 'cancelado')) or
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

create trigger before_update_pedido_status
  before update on pedidos
  for each row
  when (new.status is distinct from old.status)
  execute function validar_transicao_pedido();

-- Policy nova: gerente opera recebido→preparando→entregue/cancelado
-- (pendente→recebido/cancelado já existe em pedidos_update_aceite).
create policy pedidos_update_kanban on pedidos for update
  using (
    status in ('recebido', 'preparando')
    and (get_my_role() = 'gestor_geral' or unidade_id = get_my_unidade())
  )
  with check (
    status in ('preparando', 'entregue', 'cancelado')
    and (get_my_role() = 'gestor_geral' or unidade_id = get_my_unidade())
  );

-- RPCs de apoio ao dashboard/kanban ---------------------------------
create or replace function rpc_tempo_medio_preparo(p_unidade bigint, p_dias int default 7)
returns numeric -- minutos
language sql
stable
as $$
  select round(avg(extract(epoch from (entregue_em - preparando_em)) / 60)::numeric, 1)
  from pedidos
  where unidade_id = p_unidade
    and preparando_em is not null
    and entregue_em is not null
    and data_pedido >= current_date - (p_dias || ' days')::interval;
$$;

create or replace function rpc_itens_mais_vendidos(p_unidade bigint, p_limite int default 5)
returns table (produto_id bigint, nome text, total_quantidade bigint, total_receita numeric)
language sql
stable
as $$
  select pr.id, pr.nome, sum(pi.quantidade), sum(pi.quantidade * pi.preco_unitario)
  from pedido_itens pi
  join produtos pr on pr.id = pi.produto_id
  join pedidos p on p.id = pi.pedido_id
  where pr.unidade_id = p_unidade
    and p.status = 'entregue'
  group by pr.id, pr.nome
  order by 3 desc
  limit p_limite;
$$;

-- Realtime para cardápio e itens do pedido --------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table produtos;
    alter publication supabase_realtime add table pedido_itens;
  end if;
end $$;
