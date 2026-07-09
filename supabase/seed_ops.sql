-- ============================================================
-- Sabor & Cia — Seed complementar (módulo operacional)
-- Roda depois de seed.sql. Gera pedido_itens e faz o backfill de
-- preparando_em/entregue_em pro histórico inteiro (não só hoje) —
-- sem isso, "Tempo médio de preparo" e "Itens mais vendidos" no
-- Dashboard da Unidade davam sempre o mesmo número em qualquer
-- período (só "hoje" tinha amostra), mesmo already sendo
-- filtrados por p_inicio/p_fim. Idempotente: limpa e regenera.
-- ============================================================

begin;

delete from pedido_itens
where pedido_id in (
  select id from pedidos where data_pedido::date = current_date or status = 'entregue'
);

-- Um item por pedido (hoje, em qualquer status, ou entregue em
-- qualquer data), sorteado do cardápio disponível da própria
-- unidade — suficiente pra demonstrar o kanban e alimentar itens
-- mais vendidos em qualquer janela de período.
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
where p.data_pedido::date = current_date or p.status = 'entregue';

-- Backfill de preparando_em/entregue_em pro histórico inteiro —
-- só pedidos movidos pelo trigger novo ganham esses timestamps
-- automaticamente; o resto do seed histórico nasceu direto com o
-- status final e nunca passou pelas transições.
update pedidos
set preparando_em = data_pedido + (5 + random() * 10 || ' minutes')::interval
where status in ('preparando', 'entregue')
  and preparando_em is null;

update pedidos
set entregue_em = preparando_em + (15 + random() * 20 || ' minutes')::interval
where status = 'entregue'
  and entregue_em is null;

commit;
