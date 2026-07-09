-- ============================================================
-- Sabor & Cia — 016 Gestor de rede ativa/desativa unidade
--
-- Só o gestor_geral pode mudar unidades.status (ativar/desativar).
-- Diferente do padrão de restrição por coluna usado em produtos e no
-- horário de funcionamento (grant column-level), aqui os dois papéis
-- (gerente e gestor_geral) são o MESMO role do Postgres ("authenticated"),
-- então grant não diferencia por role de aplicação — precisa de um
-- trigger que inspeciona quem está chamando (get_my_role()).
-- ============================================================

grant update (status) on unidades to authenticated;

create or replace function validar_update_status_unidade()
returns trigger
language plpgsql
as $$
begin
  if get_my_role() <> 'gestor_geral' and new.status is distinct from old.status then
    raise exception 'apenas o gestor de rede pode ativar/desativar uma unidade';
  end if;
  return new;
end;
$$;

create trigger before_update_unidade_status
  before update on unidades
  for each row
  when (new.status is distinct from old.status)
  execute function validar_update_status_unidade();
