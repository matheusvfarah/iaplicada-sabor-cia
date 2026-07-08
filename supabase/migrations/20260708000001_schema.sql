-- ============================================================
-- Sabor & Cia — 001 Schema
-- Tabelas, enums, índices e realtime
-- ============================================================

-- Enums -------------------------------------------------------
create type unidade_status as enum ('ativa', 'inativa');
create type plataforma_pedido as enum ('ifood', 'rappi', 'proprio');
create type status_pedido as enum ('recebido', 'preparando', 'entregue', 'cancelado');
create type user_role as enum ('gestor_geral', 'gerente');
create type tipo_alerta as enum ('meta', 'avaliacao');

-- Tabelas de negócio -----------------------------------------
create table unidades (
  id            bigint generated always as identity primary key,
  nome          text not null,
  endereco      text not null,
  status        unidade_status not null default 'ativa',
  data_abertura date not null
);

create table funcionarios (
  id         bigint generated always as identity primary key,
  nome       text not null,
  unidade_id bigint not null references unidades (id),
  cargo      text not null,
  email      text not null unique
);

create table metas (
  id             bigint generated always as identity primary key,
  unidade_id     bigint not null references unidades (id),
  mes_referencia date not null check (mes_referencia = date_trunc('month', mes_referencia)::date),
  meta_receita   numeric(12, 2) not null check (meta_receita > 0),
  meta_pedidos   integer not null check (meta_pedidos > 0),
  unique (unidade_id, mes_referencia)
);

create table pedidos (
  id          bigint generated always as identity primary key,
  unidade_id  bigint not null references unidades (id),
  valor       numeric(10, 2) not null check (valor > 0),
  plataforma  plataforma_pedido not null,
  status      status_pedido not null default 'recebido',
  data_pedido timestamptz not null default now()
);

create table avaliacoes (
  id         bigint generated always as identity primary key,
  pedido_id  bigint not null references pedidos (id) unique,
  nota       smallint not null check (nota between 1 and 5),
  comentario text,
  data       timestamptz not null default now()
);

-- Perfis de acesso (liga auth.users ao papel e à unidade) -----
create table profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  nome       text not null,
  role       user_role not null default 'gerente',
  unidade_id bigint references unidades (id),
  check (role = 'gestor_geral' or unidade_id is not null)
);

-- Alertas gerados pela automação (n8n) ------------------------
create table alertas (
  id         bigint generated always as identity primary key,
  unidade_id bigint not null references unidades (id),
  tipo       tipo_alerta not null,
  mensagem   text not null,
  payload    jsonb not null default '{}',
  criado_em  timestamptz not null default now(),
  resolvido  boolean not null default false
);

-- Log de cancelamentos (alimentado por trigger) ---------------
create table log_cancelamentos (
  id           bigint generated always as identity primary key,
  pedido_id    bigint not null references pedidos (id),
  unidade_id   bigint not null references unidades (id),
  valor        numeric(10, 2) not null,
  plataforma   plataforma_pedido not null,
  cancelado_em timestamptz not null default now()
);

-- Índices -----------------------------------------------------
create index idx_pedidos_unidade_data on pedidos (unidade_id, data_pedido desc);
create index idx_pedidos_status on pedidos (status);
create index idx_avaliacoes_data on avaliacoes (data desc);
create index idx_alertas_unidade on alertas (unidade_id, criado_em desc);
create index idx_metas_mes on metas (mes_referencia);

-- RLS ligado em tudo (policies na migration 002) --------------
alter table unidades enable row level security;
alter table funcionarios enable row level security;
alter table metas enable row level security;
alter table pedidos enable row level security;
alter table avaliacoes enable row level security;
alter table profiles enable row level security;
alter table alertas enable row level security;
alter table log_cancelamentos enable row level security;

-- Realtime: pedidos ao vivo e badge de alertas ----------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table pedidos;
    alter publication supabase_realtime add table alertas;
  end if;
end $$;
