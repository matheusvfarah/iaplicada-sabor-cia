-- ============================================================
-- Sabor & Cia — 017 RPCs pra tirar agregação client-side do
-- Dashboard da Unidade (item 2 da rodada 4 — diagnóstico de
-- performance).
--
-- Antes: a tela buscava TODOS os pedidos do período só pra contar por
-- plataforma no navegador (select plataforma sem limit — centenas a
-- milhares de linhas por unidade em janelas de 6 meses/ano), e ainda
-- chamava rpc_faturamento_serie (que retorna a rede INTEIRA) só pra
-- descartar todas as unidades menos uma. Os dois casos buscavam muito
-- mais dado do que a tela realmente usa.
-- ============================================================

-- Pedidos por plataforma de UMA unidade — mesmo padrão de
-- rpc_cancelamento_plataforma, só que contando por plataforma em vez
-- de calcular taxa de cancelamento.
create or replace function rpc_pedidos_por_plataforma_unidade(
  p_unidade bigint,
  p_inicio date,
  p_fim date
)
returns table (plataforma plataforma_pedido, total bigint)
language sql
stable
as $$
  select p.plataforma, count(*)
  from pedidos p
  where p.unidade_id = p_unidade
    and p.data_pedido >= p_inicio
    and p.data_pedido < p_fim + interval '1 day'
  group by 1;
$$;

-- Série de faturamento de UMA unidade — mesma granularidade em 3
-- níveis de rpc_faturamento_serie, mas filtrada e agregada no banco
-- pra uma unidade só (a versão de rede continua existindo pro
-- Dashboard Geral, que realmente precisa das unidades todas).
create or replace function rpc_faturamento_serie_unidade(
  p_unidade bigint,
  p_inicio date,
  p_fim date
)
returns table (bucket date, receita numeric)
language sql
stable
as $$
  select
    case
      when (p_fim - p_inicio) <= 10 then date_trunc('day', p.data_pedido)::date
      when (p_fim - p_inicio) <= 60 then date_trunc('week', p.data_pedido)::date
      else date_trunc('month', p.data_pedido)::date
    end as bucket,
    coalesce(sum(p.valor) filter (where p.status = 'entregue'), 0)
  from pedidos p
  where p.unidade_id = p_unidade
    and p.data_pedido >= p_inicio
    and p.data_pedido < p_fim + interval '1 day'
  group by 1
  order by 1;
$$;
