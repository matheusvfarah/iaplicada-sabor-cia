-- ============================================================
-- Sabor & Cia — 002 RLS
-- Funções auxiliares (security definer) + policies + profiles
-- ============================================================

-- Funções auxiliares ------------------------------------------
-- security definer: leem profiles SEM passar pelas policies,
-- evitando recursão infinita (policy de profiles chamaria a si mesma).
create or replace function get_my_role()
returns user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from profiles where id = auth.uid();
$$;

create or replace function get_my_unidade()
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select unidade_id from profiles where id = auth.uid();
$$;

revoke execute on function get_my_role() from anon;
revoke execute on function get_my_unidade() from anon;

-- Policies -----------------------------------------------------
-- Padrão: gestor_geral vê tudo; gerente vê apenas a própria unidade.
-- Demo é read-only para usuários autenticados; escrita fica com o
-- service_role (n8n e seed), que ignora RLS por definição.

create policy profiles_select on profiles for select
  using (id = auth.uid() or get_my_role() = 'gestor_geral');

create policy unidades_select on unidades for select
  using (get_my_role() = 'gestor_geral' or id = get_my_unidade());

create policy funcionarios_select on funcionarios for select
  using (get_my_role() = 'gestor_geral' or unidade_id = get_my_unidade());

create policy metas_select on metas for select
  using (get_my_role() = 'gestor_geral' or unidade_id = get_my_unidade());

create policy pedidos_select on pedidos for select
  using (get_my_role() = 'gestor_geral' or unidade_id = get_my_unidade());

-- avaliacoes não tem unidade_id: filtra via pedido (RLS de pedidos
-- também se aplica dentro do exists, com os direitos do chamador)
create policy avaliacoes_select on avaliacoes for select
  using (
    exists (
      select 1 from pedidos p
      where p.id = avaliacoes.pedido_id
        and (get_my_role() = 'gestor_geral' or p.unidade_id = get_my_unidade())
    )
  );

create policy alertas_select on alertas for select
  using (get_my_role() = 'gestor_geral' or unidade_id = get_my_unidade());

-- gerente pode marcar alerta da sua unidade como resolvido
create policy alertas_update on alertas for update
  using (get_my_role() = 'gestor_geral' or unidade_id = get_my_unidade())
  with check (get_my_role() = 'gestor_geral' or unidade_id = get_my_unidade());

create policy log_cancelamentos_select on log_cancelamentos for select
  using (get_my_role() = 'gestor_geral' or unidade_id = get_my_unidade());

-- Criação automática de profile no signup ----------------------
-- O usuário é criado no dashboard do Supabase com user_metadata:
--   { "nome": "...", "role": "gestor_geral" | "gerente", "unidade_id": 1 }
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into profiles (id, nome, role, unidade_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nome', new.email),
    coalesce((new.raw_user_meta_data ->> 'role')::user_role, 'gerente'),
    nullif(new.raw_user_meta_data ->> 'unidade_id', '')::bigint
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
