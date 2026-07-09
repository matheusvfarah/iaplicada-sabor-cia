-- ============================================================
-- Sabor & Cia — 006 Catálogo de produtos + itens do pedido
-- Suporta o simulador de pedidos: cardápio por unidade,
-- itens do pedido, e o fluxo de aceite/recusa pelo gerente.
-- ============================================================

create table produtos (
  id         bigint generated always as identity primary key,
  unidade_id bigint not null references unidades (id),
  nome       text not null,
  preco      numeric(10, 2) not null check (preco > 0),
  disponivel boolean not null default true
);

create table pedido_itens (
  id             bigint generated always as identity primary key,
  pedido_id      bigint not null references pedidos (id) on delete cascade,
  produto_id     bigint not null references produtos (id),
  quantidade     integer not null check (quantidade > 0),
  preco_unitario numeric(10, 2) not null check (preco_unitario > 0)
);

create index idx_produtos_unidade on produtos (unidade_id);
create index idx_pedido_itens_pedido on pedido_itens (pedido_id);

alter table produtos enable row level security;
alter table pedido_itens enable row level security;

-- Leitura: mesmo padrão de sempre (gestor_geral tudo; gerente só a própria unidade)
create policy produtos_select on produtos for select
  using (get_my_role() = 'gestor_geral' or unidade_id = get_my_unidade());

create policy pedido_itens_select on pedido_itens for select
  using (
    exists (
      select 1 from pedidos p
      where p.id = pedido_itens.pedido_id
        and (get_my_role() = 'gestor_geral' or p.unidade_id = get_my_unidade())
    )
  );

-- Gerente pode alternar a disponibilidade do próprio cardápio
create policy produtos_update on produtos for update
  using (get_my_role() = 'gestor_geral' or unidade_id = get_my_unidade())
  with check (get_my_role() = 'gestor_geral' or unidade_id = get_my_unidade());

-- Aceite/recusa de pedidos: só pedidos pendentes da própria unidade,
-- e só para os dois destinos válidos (aceitar ou recusar).
create policy pedidos_update_aceite on pedidos for update
  using (
    status = 'pendente'
    and (get_my_role() = 'gestor_geral' or unidade_id = get_my_unidade())
  )
  with check (
    status in ('recebido', 'cancelado')
    and (get_my_role() = 'gestor_geral' or unidade_id = get_my_unidade())
  );
