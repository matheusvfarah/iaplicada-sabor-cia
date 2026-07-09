-- ============================================================
-- Sabor & Cia — 007 RPC do simulador de pedidos
-- Insere pedido (status 'pendente') + itens numa única transação,
-- validando produto/disponibilidade/unidade e calculando o valor
-- a partir do preço atual do cardápio (nunca confia em preço
-- vindo do payload do simulador).
-- ============================================================
create or replace function rpc_inserir_pedido_simulado(
  p_unidade_id bigint,
  p_plataforma plataforma_pedido,
  p_itens jsonb -- [{"produto_id": 1, "quantidade": 2}, ...]
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pedido_id bigint;
  v_valor numeric(10, 2) := 0;
  v_item record;
  v_preco numeric(10, 2);
begin
  if p_itens is null or jsonb_array_length(p_itens) = 0 then
    raise exception 'itens vazio';
  end if;

  for v_item in
    select * from jsonb_to_recordset(p_itens) as x(produto_id bigint, quantidade int)
  loop
    if v_item.quantidade is null or v_item.quantidade <= 0 then
      raise exception 'quantidade inválida para produto %', v_item.produto_id;
    end if;

    select preco into v_preco
    from produtos
    where id = v_item.produto_id
      and unidade_id = p_unidade_id
      and disponivel = true;

    if v_preco is null then
      raise exception 'produto % indisponível ou não pertence à unidade %', v_item.produto_id, p_unidade_id;
    end if;

    v_valor := v_valor + (v_preco * v_item.quantidade);
  end loop;

  insert into pedidos (unidade_id, valor, plataforma, status)
  values (p_unidade_id, v_valor, p_plataforma, 'pendente')
  returning id into v_pedido_id;

  insert into pedido_itens (pedido_id, produto_id, quantidade, preco_unitario)
  select v_pedido_id, x.produto_id, x.quantidade, pr.preco
  from jsonb_to_recordset(p_itens) as x(produto_id bigint, quantidade int)
  join produtos pr on pr.id = x.produto_id;

  return v_pedido_id;
end;
$$;

-- Só o service_role chama isso (o endpoint do simulador) — nunca
-- o cliente/anon/authenticated diretamente.
revoke execute on function rpc_inserir_pedido_simulado(bigint, plataforma_pedido, jsonb)
  from public, anon, authenticated;
