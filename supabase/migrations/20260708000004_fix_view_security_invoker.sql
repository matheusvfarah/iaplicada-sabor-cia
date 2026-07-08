-- ============================================================
-- Sabor & Cia — 004 Fix: v_alerta_metas sem SECURITY DEFINER
-- ============================================================
-- A view rodava com os privilégios do dono (postgres), ignorando
-- o RLS de unidades/metas/pedidos para quem a consultasse. Com
-- security_invoker = true, a view respeita o RLS de quem chama:
-- gerente só vê a própria unidade, gestor_geral vê tudo, e o
-- service_role (n8n) continua vendo tudo por já bypassar RLS.
alter view v_alerta_metas set (security_invoker = true);
