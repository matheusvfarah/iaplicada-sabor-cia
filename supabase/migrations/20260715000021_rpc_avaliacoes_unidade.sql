-- ============================================================
-- Sabor & Cia — 021 Aba Avaliações (Rodada 5, item 1)
--
-- Lista de avaliações de uma unidade num período, já com os dados do
-- pedido vinculado (código/valor/plataforma) — mesmo padrão das RPCs
-- de 017 (invoker, não definer: a RLS de pedidos/avaliacoes já
-- restringe o que cada papel enxerga, então gerente pedindo outra
-- unidade só recebe zero linhas em vez de precisar de checagem extra
-- aqui).
-- ============================================================

create or replace function rpc_avaliacoes_unidade(
  p_unidade bigint,
  p_inicio date,
  p_fim date
)
returns table (
  id bigint,
  nota smallint,
  comentario text,
  data timestamptz,
  pedido_id bigint,
  pedido_codigo text,
  pedido_valor numeric,
  pedido_plataforma plataforma_pedido
)
language sql
stable
as $$
  select a.id, a.nota, a.comentario, a.data, p.id, p.codigo, p.valor, p.plataforma
  from avaliacoes a
  join pedidos p on p.id = a.pedido_id
  where p.unidade_id = p_unidade
    and a.data >= p_inicio
    and a.data < p_fim + interval '1 day'
  order by a.data desc;
$$;
