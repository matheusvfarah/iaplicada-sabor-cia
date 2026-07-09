-- ============================================================
-- Sabor & Cia — 013 Tempo médio de preparo e itens mais vendidos
-- seguem o filtro de período do Dashboard da Unidade.
--
-- Antes: rpc_tempo_medio_preparo usava p_dias (janela fixa relativa
-- a hoje) e rpc_itens_mais_vendidos não tinha filtro de data nenhum
-- (histórico completo) — o gerente trocava o período no dashboard
-- e esses dois cards não se moviam. Trocamos ambas pra receber
-- p_inicio/p_fim, igual toda outra RPC de período já usa
-- (rpc_kpis_unidade_periodo, rpc_kpis_unidades etc).
--
-- O kanban de Pedidos (Fase 2) segue chamando
-- rpc_tempo_medio_preparo, só que agora com p_inicio=p_fim=hoje em
-- vez de p_dias=1 — mesmo resultado, assinatura unificada.
-- ============================================================

drop function if exists rpc_tempo_medio_preparo(bigint, int);
drop function if exists rpc_itens_mais_vendidos(bigint, int);

create or replace function rpc_tempo_medio_preparo(p_unidade bigint, p_inicio date, p_fim date)
returns numeric -- minutos
language sql
stable
as $$
  select round(avg(extract(epoch from (entregue_em - preparando_em)) / 60)::numeric, 1)
  from pedidos
  where unidade_id = p_unidade
    and preparando_em is not null
    and entregue_em is not null
    and data_pedido >= p_inicio
    and data_pedido < p_fim + interval '1 day';
$$;

create or replace function rpc_itens_mais_vendidos(
  p_unidade bigint,
  p_inicio date,
  p_fim date,
  p_limite int default 5
)
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
    and p.data_pedido >= p_inicio
    and p.data_pedido < p_fim + interval '1 day'
  group by pr.id, pr.nome
  order by 3 desc
  limit p_limite;
$$;
