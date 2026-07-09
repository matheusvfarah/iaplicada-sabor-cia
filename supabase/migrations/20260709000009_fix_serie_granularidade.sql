-- ============================================================
-- Sabor & Cia — 009 Granularidade em 3 níveis pro gráfico
-- 30 dias em barras diárias ficava pesado/ilegível — agora usa
-- semana como nível intermediário.
-- ============================================================
create or replace function rpc_faturamento_serie(p_inicio date, p_fim date)
returns table (bucket date, unidade_id bigint, unidade_nome text, total_pedidos bigint, receita numeric)
language sql
stable
as $$
  select
    case
      when (p_fim - p_inicio) <= 10 then date_trunc('day', p.data_pedido)::date
      when (p_fim - p_inicio) <= 60 then date_trunc('week', p.data_pedido)::date
      else date_trunc('month', p.data_pedido)::date
    end as bucket,
    u.id,
    u.nome,
    count(*) filter (where p.status = 'entregue'),
    coalesce(sum(p.valor) filter (where p.status = 'entregue'), 0)
  from pedidos p
  join unidades u on u.id = p.unidade_id
  where p.data_pedido >= p_inicio
    and p.data_pedido < p_fim + interval '1 day'
  group by 1, 2, 3
  order by 1, 3;
$$;
