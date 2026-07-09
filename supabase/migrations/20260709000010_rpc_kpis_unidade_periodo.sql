-- ============================================================
-- Sabor & Cia — 010 KPIs da unidade por período
-- rpc_kpis_unidade (mês fixo) continua existindo; esta é a versão
-- usada pelo Dashboard da Unidade agora que ele também tem filtro
-- de período (mesma lógica de meta prorrateada do rpc_meta_periodo).
-- ============================================================
create or replace function rpc_kpis_unidade_periodo(p_unidade bigint, p_inicio date, p_fim date)
returns table (
  receita numeric,
  meta numeric,
  pct_meta numeric,
  nota_media numeric,
  total_avaliacoes bigint
)
language sql
stable
as $$
  with receita as (
    select coalesce(sum(valor), 0) as r
    from pedidos
    where unidade_id = p_unidade
      and status = 'entregue'
      and data_pedido >= p_inicio
      and data_pedido < p_fim + interval '1 day'
  ),
  meta as (
    select coalesce(sum(
      m.meta_receita
      * (
          least(p_fim, (m.mes_referencia + interval '1 month' - interval '1 day')::date)
          - greatest(p_inicio, m.mes_referencia)
          + 1
        )::numeric
      / extract(day from (m.mes_referencia + interval '1 month' - interval '1 day'))
    ), 0) as m
    from metas m
    where m.unidade_id = p_unidade
      and m.mes_referencia <= p_fim
      and (m.mes_referencia + interval '1 month' - interval '1 day')::date >= p_inicio
  ),
  notas as (
    select round(avg(a.nota), 2) as nm, count(*) as qt
    from avaliacoes a
    join pedidos p on p.id = a.pedido_id
    where p.unidade_id = p_unidade
      and a.data >= p_inicio
      and a.data < p_fim + interval '1 day'
  )
  select r, m, case when m > 0 then round(r / m, 4) else null end, nm, qt
  from receita, meta, notas;
$$;
