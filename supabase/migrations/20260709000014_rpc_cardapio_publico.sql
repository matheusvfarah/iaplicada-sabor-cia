-- ============================================================
-- Sabor & Cia — 014 Cardápio disponível, leitura pública (anon)
--
-- O workflow n8n que simula pedidos chegando (WF3) precisa saber
-- quais itens estão disponíveis numa unidade AGORA (respeitando o
-- toggle de pausa) antes de montar o payload do POST em
-- /api/pedidos/simular — sem isso, o gerador ficaria cego e teria
-- que adivinhar produto_id, quebrando toda vez que um item for
-- pausado. n8n chama isso sem sessão de usuário (só a anon key),
-- e RLS de "produtos" exige um profile autenticado — daí o
-- security definer, expondo só id/nome/preco de itens disponíveis
-- (exatamente o que qualquer cardápio público de verdade mostra,
-- nada sensível).
-- ============================================================

create or replace function rpc_cardapio_disponivel(p_unidade bigint)
returns table (produto_id bigint, nome text, preco numeric)
language sql
security definer
set search_path = public
stable
as $$
  select id, nome, preco
  from produtos
  where unidade_id = p_unidade and disponivel = true;
$$;

revoke all on function rpc_cardapio_disponivel(bigint) from public;
grant execute on function rpc_cardapio_disponivel(bigint) to anon, authenticated;
