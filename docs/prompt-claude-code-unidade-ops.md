# Prompt — Módulo operacional da Unidade (colar no Claude Code)

---

Leia primeiro: `README.md`, `docs/01-spec-design-sabor-cia.md`, todas as migrations em `supabase/migrations/` e `supabase/seed.sql`. Só depois comece. Não altere migrations já aplicadas — mudanças de banco entram em migrations novas.

## Contexto

Painel "Sabor & Cia" (dark kitchens) — Supabase (auth, RLS, Realtime) + React. Hoje existem 2 dashboards (gestor geral e gerente). Esta mudança transforma a área do gerente num módulo operacional com 4 páginas: **Dashboard, Pedidos, Cardápio e Configurações**.

Fluxo central: pedidos chegam de fora via n8n (POST → insert com status `recebido`), aparecem em tempo real na página Pedidos, o gerente **aceita** (→ `preparando`, inicia cronômetro de produção), depois **finaliza** (→ `entregue`) ou **cancela** (→ `cancelado`, trigger de log já existe).

## Regras inegociáveis

- O enum `status_pedido` (`recebido/preparando/entregue/cancelado`) NÃO muda — é requisito do teste técnico. Tempo de produção vem de timestamps novos.
- RLS em tudo: gerente só vê/opera a própria unidade (`get_my_unidade()`); gestor geral vê tudo.
- Inserção de pedidos continua exclusiva do service_role (n8n). Gerente só faz UPDATE de status.
- Agregações via RPC no Postgres, nunca no cliente.
- Commits pequenos por fase, mensagens descritivas.

## Fase 1 — Banco (migration nova `2026xxxxxxxxxx_ops_unidade.sql`)

1. `alter table pedidos add column preparando_em timestamptz, add column entregue_em timestamptz, add column codigo text` (código curto exibível, ex. "#A1B2").
2. Tabela `cardapio_itens` (id, unidade_id FK, nome, descricao, preco numeric(10,2), categoria text, pausado boolean default false, criado_em). RLS: select gestor/gerente da unidade; **update apenas do campo pausado** pelo gerente da unidade (use trigger ou policy com check para impedir alteração de preço/nome).
3. Tabela `pedido_itens` (id, pedido_id FK, cardapio_item_id FK, quantidade int check > 0, preco_unitario numeric(10,2)). RLS de select via join com pedidos (mesmo padrão de `avaliacoes`).
4. Policy nova em `pedidos`: gerente pode UPDATE apenas de `status`, `preparando_em`, `entregue_em` na sua unidade, e apenas transições válidas: recebido→preparando, preparando→entregue, recebido/preparando→cancelado. Valide a transição com trigger `before update` (raise exception em transição inválida) — policy não vê o valor antigo com clareza suficiente.
5. Trigger `before update` em pedidos: ao entrar em `preparando`, seta `preparando_em = now()` se nulo; ao entrar em `entregue`, seta `entregue_em = now()`.
6. RPC `rpc_tempo_medio_preparo(p_unidade, p_dias default 7)` → tempo médio entre `preparando_em` e `entregue_em`.
7. Adicionar `cardapio_itens` e `pedido_itens` ao realtime publication (pedidos já está).
8. Seed complementar (`supabase/seed_ops.sql`): ~12 itens de cardápio por unidade ativa (categorias: burgers, pratos, bebidas, sobremesas; 1-2 pausados), `pedido_itens` para os pedidos de hoje, códigos para pedidos de hoje.
9. Atualizar `supabase/validate-sql.mjs`: incluir a migration nova e o seed novo, testar a transição inválida (deve falhar) e o RPC novo.

## Fase 2 — Página Pedidos (a estrela da demo)

Layout kanban de 3 colunas: **Recebidos · Em produção · Finalizados (hoje)**.

- Card do pedido: código, plataforma (badge com cor por plataforma), itens (qtde × nome), valor total, horário, e **cronômetro ao vivo**:
  - Recebido: tempo desde `data_pedido` (aguardando aceite) — acima de 5 min, destaque de urgência (borda/cor warning).
  - Em produção: tempo desde `preparando_em` — acima de 20 min, destaque danger.
- Botões grandes e óbvios (isso vai ser demonstrado em vídeo/entrevista):
  - Recebido: `Aceitar pedido` (primário) e `Recusar` (ghost/danger, com confirmação).
  - Em produção: `Finalizar` (primário) e `Cancelar` (com confirmação).
- Realtime: subscribe em `pedidos` da unidade (INSERT + UPDATE). Pedido novo entra na coluna Recebidos com animação sutil (slide/fade) e som opcional (toggle em Configurações). Optimistic update ao clicar; rollback com toast em erro.
- Header da página: contadores por coluna + tempo médio de preparo do dia (RPC).
- Empty states caprichados por coluna.

## Fase 3 — Página Cardápio

- Grid de cards por categoria: nome, descrição, preço, foto placeholder (ícone por categoria).
- Switch grande **Ativo/Pausado** por item — optimistic, com toast "Item pausado — não aparece para novos pedidos".
- Item pausado: card esmaecido (opacity + badge "Pausado").
- Busca por nome e filtro por categoria.
- Contador no topo: "X itens ativos · Y pausados".

## Fase 4 — Dashboard da unidade + navegação + Configurações

- Navegação da área do gerente vira sidebar (desktop) / bottom tabs (mobile): Dashboard, Pedidos (com badge de recebidos pendentes), Cardápio, Configurações.
- Dashboard da unidade mantém os KPIs atuais (receita vs. meta, nota média, top 5) e ganha: tempo médio de preparo (7 dias) e itens mais vendidos (novo RPC simples sobre pedido_itens).
- Configurações: dados da unidade (read-only), toggle dark mode, toggle som de novo pedido, botão sair. Simples — é página de presença, não de complexidade.
- Gestor geral: no dashboard dele, cada unidade do ranking linka para a visão da unidade (gestor pode tudo pela RLS).

## Fase 5 — Contrato com o n8n (documentar em `automations/README.md`)

Endpoint que o n8n chamará (Edge Function `novo-pedido` OU insert direto via service_role — escolha, justifique no README):

```json
POST { "unidade_id": 1, "plataforma": "ifood",
       "itens": [{ "cardapio_item_id": 3, "quantidade": 2 }] }
```

Servidor calcula `valor` a partir dos preços do cardápio (nunca confiar no payload), rejeita itens pausados, gera `codigo`, insere pedido + pedido_itens com status `recebido`. Header `x-webhook-secret` obrigatório. Documente request/response e erros.

## Critérios de aceite

1. `node supabase/validate-sql.mjs` passa, incluindo teste de transição inválida.
2. Insert manual de um pedido (SQL editor, service_role) faz o card aparecer na coluna Recebidos **sem refresh**.
3. Aceitar → cronômetro inicia; Finalizar → card vai para Finalizados e `entregue_em` preenchido.
4. Gerente da unidade 1 não vê nem opera pedidos/cardápio da unidade 2 (testar com as duas contas).
5. Pausar item no Cardápio reflete no banco e o POST do n8n com item pausado é rejeitado.
6. Tudo responsivo; kanban vira lista com tabs no mobile.

Trabalhe fase por fase, commit ao fim de cada uma. Se algo do código existente conflitar com este plano, pare e me pergunte antes de refatorar.
