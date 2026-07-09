-- ============================================================
-- Sabor & Cia — 018 Config operacional de pedidos por unidade
--
-- Duas configurações novas, editáveis por gerente (própria unidade)
-- ou gestor_geral (qualquer unidade) — mesmo padrão de
-- unidades_update_horario (015):
--   · tempo_limite_aceite_min: quantos minutos um pedido "recebido"
--     espera antes de ser recusado automaticamente pelo kanban.
--   · meta_tempo_preparo_min: tempo médio esperado de preparo — passar
--     disso dispara o alerta de atraso no kanban.
-- ============================================================

alter table unidades
  add column tempo_limite_aceite_min integer not null default 5
    check (tempo_limite_aceite_min > 0),
  add column meta_tempo_preparo_min integer not null default 20
    check (meta_tempo_preparo_min > 0);

grant update (tempo_limite_aceite_min, meta_tempo_preparo_min) on unidades to authenticated;

create policy unidades_update_config_pedidos on unidades for update
  using (get_my_role() = 'gestor_geral' or id = get_my_unidade())
  with check (get_my_role() = 'gestor_geral' or id = get_my_unidade());
