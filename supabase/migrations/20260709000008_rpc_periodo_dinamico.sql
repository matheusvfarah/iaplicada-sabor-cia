-- ============================================================
-- Sabor & Cia — 008 RPCs para o Dashboard Geral seguir o filtro
-- de período por completo (nada fica fixo em mês/6 meses).
-- ============================================================

-- Meta prorrateada pro período selecionado -----------------------
-- metas.meta_receita é sempre mensal; aqui prorrateamos pelo
-- número de dias do mês que caem dentro de [p_inicio, p_fim],
-- somado entre todas as unidades e meses que o período cobre.
create or replace function rpc_meta_periodo(p_inicio date, p_fim date)
returns numeric
language sql
stable
as $$
  select coalesce(sum(
    m.meta_receita
    * (
        least(p_fim, (m.mes_referencia + interval '1 month' - interval '1 day')::date)
        - greatest(p_inicio, m.mes_referencia)
        + 1
      )::numeric
    / extract(day from (m.mes_referencia + interval '1 month' - interval '1 day'))
  ), 0)
  from metas m
  where m.mes_referencia <= p_fim
    and (m.mes_referencia + interval '1 month' - interval '1 day')::date >= p_inicio;
$$;

-- Série de faturamento que acompanha o período --------------------
-- Granularidade automática: diária se o período tem até 31 dias,
-- mensal caso contrário (períodos maiores ficariam ilegíveis por dia).
create or replace function rpc_faturamento_serie(p_inicio date, p_fim date)
returns table (bucket date, unidade_id bigint, unidade_nome text, total_pedidos bigint, receita numeric)
language sql
stable
as $$
  select
    case when (p_fim - p_inicio) <= 31
      then date_trunc('day', p.data_pedido)::date
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
