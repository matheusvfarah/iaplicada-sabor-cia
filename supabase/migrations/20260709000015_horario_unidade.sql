-- ============================================================
-- Sabor & Cia — 015 Horário de funcionamento da unidade
--
-- Status "aberta/fechada" deixa de ser só o campo `status` manual e
-- passa a ser derivado do horário de funcionamento no client (dot da
-- sidebar, seletor de unidades, chip "N de 4 unidades abertas").
-- ============================================================

alter table unidades
  add column horario_abertura time not null default '11:00',
  add column horario_fechamento time not null default '23:00';

-- Gerente só pode alterar o horário de funcionamento da própria
-- unidade, nunca nome/endereço/status — mesmo padrão restritivo por
-- coluna usado em produtos.disponivel (011).
revoke update on unidades from authenticated;
grant update (horario_abertura, horario_fechamento) on unidades to authenticated;

create policy unidades_update_horario on unidades for update
  using (get_my_role() = 'gestor_geral' or id = get_my_unidade())
  with check (get_my_role() = 'gestor_geral' or id = get_my_unidade());
