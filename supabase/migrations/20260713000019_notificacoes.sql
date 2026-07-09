-- ============================================================
-- Sabor & Cia — 019 Notificações (Fase 1 — modelo de dados)
--
-- Substitui os alertas de horário calculados no client (localStorage,
-- ver use-horario-alertas.ts) por notificações persistidas no banco,
-- geradas server-side (Fase 2) e por papel (gerente/gestor).
-- ============================================================

create type tipo_notificacao as enum
  ('pedido_novo', 'pedido_cancelado_auto', 'pedido_atrasado', 'vai_abrir', 'vai_fechar');

create table notificacoes (
  id            bigint generated always as identity primary key,
  profile_id    uuid not null references profiles (id) on delete cascade,
  unidade_id    bigint not null references unidades (id),
  tipo          tipo_notificacao not null,
  titulo        text not null,
  mensagem      text not null,
  ref_pedido_id bigint references pedidos (id),
  criado_em     timestamptz not null default now(),
  lida          boolean not null default false,
  lida_em       timestamptz
);

create index idx_notificacoes_profile on notificacoes (profile_id, lida, criado_em desc);
create index idx_notificacoes_unidade on notificacoes (unidade_id, tipo, lida);

-- Dedupe -------------------------------------------------------
-- `criado_em::date` sozinho não é IMMUTABLE (depende do timezone da
-- sessão), o que o Postgres exige pra índice — envolve numa função
-- IMMUTABLE que fixa America/Sao_Paulo explicitamente.
create or replace function dia_sao_paulo(ts timestamptz)
returns date
language sql
immutable
as $$
  select (ts at time zone 'America/Sao_Paulo')::date;
$$;

-- vai_abrir/vai_fechar: no máximo uma por dia, por destinatário e
-- unidade.
create unique index uniq_notificacao_horario
  on notificacoes (profile_id, unidade_id, tipo, dia_sao_paulo(criado_em))
  where tipo in ('vai_abrir', 'vai_fechar');

-- pedido_novo/pedido_cancelado_auto/pedido_atrasado: no máximo uma
-- por destinatário e pedido (não repete a cada execução do cron).
create unique index uniq_notificacao_pedido
  on notificacoes (profile_id, tipo, ref_pedido_id)
  where tipo in ('pedido_novo', 'pedido_cancelado_auto', 'pedido_atrasado');

alter table notificacoes enable row level security;

-- Cada usuário só vê e só marca como lida a própria notificação.
create policy notificacoes_select on notificacoes for select
  using (profile_id = auth.uid());

-- Restrição por coluna (mesmo padrão do cardápio/horário) — só
-- lida/lida_em são graváveis pelo dono; os outros campos são
-- somente-leitura pra quem não for o gerador (funções security
-- definer da Fase 2, que bypassam RLS). Não precisa de trigger aqui
-- porque a regra é igual pra gerente e gestor (diferente do caso de
-- unidades.status, que distingue por papel).
grant update (lida, lida_em) on notificacoes to authenticated;

create policy notificacoes_update on notificacoes for update
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- Sem policy de INSERT de propósito: notificações só nascem via
-- funções security definer (Fase 2) — igual ao padrão já usado em
-- alertas/log_cancelamentos, que também não têm insert policy pra
-- authenticated.

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table notificacoes;
  end if;
end $$;

-- Limite de atraso configurável por unidade ---------------------
-- Renomeia meta_tempo_preparo_min (adicionado na rodada anterior com
-- o mesmo propósito, sem faixa de validação) para o nome e a checagem
-- pedidos neste prompt — evita duas colunas com o mesmo significado.
alter table unidades rename column meta_tempo_preparo_min to limite_atraso_min;
alter table unidades drop constraint unidades_meta_tempo_preparo_min_check;
alter table unidades add constraint unidades_limite_atraso_min_check
  check (limite_atraso_min between 5 and 120);
