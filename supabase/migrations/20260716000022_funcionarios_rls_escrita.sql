-- ============================================================
-- Sabor & Cia — 022 CRUD de funcionários (Rodada 5, item 2)
--
-- funcionarios só tinha policy de select (002) — a lista era read-only
-- até aqui. Adiciona insert/update/delete no mesmo padrão de
-- get_my_role()/get_my_unidade() já usado nas outras tabelas: gestor
-- geral mexe em qualquer unidade, gerente só na própria (with check
-- também no update pra impedir "sequestrar" o funcionário reatribuindo
-- pra outra unidade_id que não seja a sua).
-- ============================================================

create policy funcionarios_insert on funcionarios for insert
  with check (get_my_role() = 'gestor_geral' or unidade_id = get_my_unidade());

create policy funcionarios_update on funcionarios for update
  using (get_my_role() = 'gestor_geral' or unidade_id = get_my_unidade())
  with check (get_my_role() = 'gestor_geral' or unidade_id = get_my_unidade());

create policy funcionarios_delete on funcionarios for delete
  using (get_my_role() = 'gestor_geral' or unidade_id = get_my_unidade());
