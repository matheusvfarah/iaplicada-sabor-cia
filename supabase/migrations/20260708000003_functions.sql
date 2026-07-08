-- ============================================================
-- Sabor & Cia — 003 Functions
-- Trigger de cancelamento, RPCs de agregação e view do alerta
-- ============================================================

-- Trigger: auditoria de cancelamentos --------------------------
create or replace function log_cancelamento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'cancelado'
     and (tg_op = 'INSERT' or old.status is distinct from 'cancelado') then
    insert into log_cancelamentos (pedido_id, unidade_id, valor, plataforma, cancelado_em)
    values (new.id, new.unidade_id, new.valor, new.plataforma, new.data_pedido);
  end if;
  return new;
end;
$$;

-- Cobre UPDATE (fluxo normal) e INSERT (pedido que já entra cancelado,
-- ex.: importação/seed) — o log fica completo nos dois caminhos.
create trigger on_pedido_cancelado
  after insert or update of status on pedidos
  for each row execute function log_cancelamento();

-- RPCs de agregação --------------------------------------------
-- security invoker (padrão): o RLS do chamador se aplica dentro
-- das queries — um gerente só agrega dados da própria unidade.

-- Receita do período vs. meta consolidada (gauge do dashboard geral)
create or replace function rpc_resumo_mes(p_mes date default date_trunc('month', current_date)::date)
returns table (receita_total numeric, meta_total numeric, pct_meta numeric, total_pedidos bigint)
language sql
stable
as $$
  with receita as (
    select coalesce(sum(valor), 0) as r, count(*) as n
    from pedidos
    where status = 'entregue'
      and data_pedido >= p_mes
      and data_pedido < p_mes + interval '1 month'
  ),
  meta as (
    select coalesce(sum(meta_receita), 0) as m
    from metas
    where mes_referencia = p_mes
  )
  select r, m, case when m > 0 then round(r / m, 4) else null end, n
  from receita, meta;
$$;

-- Série mensal por unidade — últimos 6 meses (gráfico comparativo)
create or replace function rpc_pedidos_6m()
returns table (mes date, unidade_id bigint, unidade_nome text, total_pedidos bigint, receita numeric)
language sql
stable
as $$
  select
    date_trunc('month', p.data_pedido)::date as mes,
    u.id,
    u.nome,
    count(*) filter (where p.status = 'entregue'),
    coalesce(sum(p.valor) filter (where p.status = 'entregue'), 0)
  from pedidos p
  join unidades u on u.id = p.unidade_id
  where p.data_pedido >= date_trunc('month', current_date) - interval '5 months'
  group by 1, 2, 3
  order by 1, 3;
$$;

-- KPIs por unidade no período: receita, pedidos, ticket médio
-- (serve ticket médio + ranking por faturamento)
create or replace function rpc_kpis_unidades(
  p_inicio date default date_trunc('month', current_date)::date,
  p_fim    date default current_date
)
returns table (unidade_id bigint, unidade_nome text, receita numeric, pedidos bigint, ticket_medio numeric)
language sql
stable
as $$
  select
    u.id,
    u.nome,
    coalesce(sum(p.valor) filter (where p.status = 'entregue'), 0),
    count(p.id) filter (where p.status = 'entregue'),
    round(coalesce(avg(p.valor) filter (where p.status = 'entregue'), 0), 2)
  from unidades u
  left join pedidos p
    on p.unidade_id = u.id
   and p.data_pedido >= p_inicio
   and p.data_pedido < p_fim + interval '1 day'
  where u.status = 'ativa'
  group by 1, 2
  order by 3 desc;
$$;

-- Taxa de cancelamento por plataforma no período
create or replace function rpc_cancelamento_plataforma(
  p_inicio date default date_trunc('month', current_date)::date,
  p_fim    date default current_date
)
returns table (plataforma plataforma_pedido, total bigint, cancelados bigint, taxa numeric)
language sql
stable
as $$
  select
    p.plataforma,
    count(*),
    count(*) filter (where p.status = 'cancelado'),
    round(count(*) filter (where p.status = 'cancelado')::numeric / nullif(count(*), 0), 4)
  from pedidos p
  where p.data_pedido >= p_inicio
    and p.data_pedido < p_fim + interval '1 day'
  group by 1
  order by 4 desc;
$$;

-- KPIs do dashboard da unidade (receita vs. meta + nota média do mês)
create or replace function rpc_kpis_unidade(
  p_unidade bigint,
  p_mes     date default date_trunc('month', current_date)::date
)
returns table (receita_mes numeric, meta_receita numeric, pct_meta numeric, nota_media numeric, total_avaliacoes bigint)
language sql
stable
as $$
  with receita as (
    select coalesce(sum(valor), 0) as r
    from pedidos
    where unidade_id = p_unidade
      and status = 'entregue'
      and data_pedido >= p_mes
      and data_pedido < p_mes + interval '1 month'
  ),
  meta as (
    select meta_receita as m
    from metas
    where unidade_id = p_unidade and mes_referencia = p_mes
  ),
  notas as (
    select round(avg(a.nota), 2) as nm, count(*) as qt
    from avaliacoes a
    join pedidos p on p.id = a.pedido_id
    where p.unidade_id = p_unidade
      and a.data >= p_mes
      and a.data < p_mes + interval '1 month'
  )
  select r, m, case when m > 0 then round(r / m, 4) else null end, nm, qt
  from receita
  left join meta on true
  left join notas on true;
$$;

-- View consumida pelo n8n (alerta de meta) ----------------------
-- security_invoker off por padrão: o n8n acessa com service_role.
create or replace view v_alerta_metas as
select
  u.id as unidade_id,
  u.nome as unidade_nome,
  m.mes_referencia,
  m.meta_receita,
  coalesce(r.receita, 0) as receita_acumulada,
  round(coalesce(r.receita, 0) / m.meta_receita, 4) as pct_meta,
  (date_trunc('month', current_date) + interval '1 month')::date - current_date as dias_restantes
from unidades u
join metas m
  on m.unidade_id = u.id
 and m.mes_referencia = date_trunc('month', current_date)::date
left join lateral (
  select sum(valor) as receita
  from pedidos p
  where p.unidade_id = u.id
    and p.status = 'entregue'
    and p.data_pedido >= m.mes_referencia
) r on true
where u.status = 'ativa';
