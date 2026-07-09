-- ============================================================
-- Sabor & Cia — Seed complementar (módulo operacional, Fase 1)
-- Roda depois de seed.sql. Gera pedido_itens para os pedidos de
-- hoje — demo do kanban de Pedidos e do RPC de itens mais vendidos.
-- Idempotente: limpa e regenera só os itens de pedidos de hoje.
-- ============================================================

begin;

delete from pedido_itens
where pedido_id in (select id from pedidos where data_pedido::date = current_date);

-- Um item por pedido de hoje, sorteado do cardápio disponível da
-- própria unidade — suficiente pra demonstrar a lista de itens no
-- card do kanban sem precisar reconciliar com o valor histórico.
insert into pedido_itens (pedido_id, produto_id, quantidade, preco_unitario)
select p.id, pr.id, (1 + floor(random() * 2))::int, pr.preco
from pedidos p
join lateral (
  select id, preco
  from produtos
  where unidade_id = p.unidade_id and disponivel = true
  order by random()
  limit 1
) pr on true
where p.data_pedido::date = current_date;

-- Backfill de preparando_em/entregue_em pros pedidos de hoje que já
-- nasceram 'preparando'/'entregue' no seed histórico (só pedidos
-- movidos pelo trigger novo ganham esses timestamps automaticamente).
-- Sem isso o kanban mostra "Finalizados" sem horário de entrega.
update pedidos
set preparando_em = data_pedido + (5 + random() * 10 || ' minutes')::interval
where data_pedido::date = current_date
  and status in ('preparando', 'entregue')
  and preparando_em is null;

update pedidos
set entregue_em = preparando_em + (15 + random() * 20 || ' minutes')::interval
where data_pedido::date = current_date
  and status = 'entregue'
  and entregue_em is null;

commit;
