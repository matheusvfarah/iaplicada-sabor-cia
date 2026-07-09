-- ============================================================
-- Sabor & Cia — 005 Novo status: pendente
-- Pedidos simulados chegam como 'pendente' até o gerente
-- aceitar/recusar. Precisa ser sua própria migration: Postgres
-- não permite usar um valor de enum na mesma transação em que
-- foi criado.
-- ============================================================
alter type status_pedido add value 'pendente' before 'recebido';
