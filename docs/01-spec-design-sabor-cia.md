# Spec — Painel Sabor & Cia (Teste Técnico IAplicada)

**Data:** 2026-07-08 · **Prazo:** 72h · **Entrega:** repo GitHub público + deploy + credenciais → mariana@iaplicada.com

## Objetivo

Painel operacional para rede de dark kitchens: performance de unidades, pedidos, receita e metas, com dois perfis de acesso, automação de alertas em n8n e deploy público.

## Stack

| Camada | Ferramenta | Justificativa |
|---|---|---|
| Frontend | Lovable (scaffold) + Claude Code (refinamento via GitHub sync) | Stack recomendada; velocidade + controle fino |
| Backend | Supabase (Auth, Postgres, RLS, Realtime) | Stack recomendada |
| Automação | n8n Cloud | Stack recomendada |
| Deploy | Vercel | Stack recomendada |
| Gráficos/UI | Recharts + shadcn/ui + Tailwind | Padrão do Lovable, produtivo |

## 1. Banco de dados

### Tabelas

- `unidades` (id, nome, endereco, status ativa/inativa, data_abertura)
- `pedidos` (id, unidade_id, valor, plataforma ifood/rappi/proprio, status recebido/preparando/entregue/cancelado, data_pedido)
- `metas` (id, unidade_id, mes_referencia, meta_receita, meta_pedidos)
- `funcionarios` (id, nome, unidade_id, cargo, email)
- `avaliacoes` (id, pedido_id, nota 1–5, comentario, data)
- `profiles` (id → auth.users, nome, role `gestor_geral`/`gerente`, unidade_id nullable) — **adicional**
- `alertas` (id, unidade_id, tipo `meta`/`avaliacao`, mensagem, payload jsonb, criado_em, resolvido bool) — **adicional**, alimentada pelo n8n
- `log_cancelamentos` (id, pedido_id, valor, plataforma, cancelado_em) — **adicional**, alimentada por trigger

### RLS

- Funções `security definer`: `get_my_role()` e `get_my_unidade()` (evitam recursão de policy em `profiles`).
- Policy padrão em todas as tabelas de negócio: `gestor_geral` → tudo; `gerente` → apenas `unidade_id = get_my_unidade()`.
- `avaliacoes` filtra via join com `pedidos`.
- Nenhuma tabela sem RLS; escrita bloqueada exceto onde necessário (demo é read-mostly).

### Functions / Triggers

1. **Trigger** `on_pedido_cancelado`: ao mudar status para `cancelado`, insere em `log_cancelamentos`.
2. **RPCs de agregação** (dashboards não calculam no cliente):
   - `rpc_kpis_gerais(periodo)` — receita do mês, meta consolidada, ticket médio por unidade, taxa de cancelamento por plataforma, ranking
   - `rpc_pedidos_6m()` — série mensal por unidade
   - `rpc_kpis_unidade(unidade, periodo)` — receita vs. meta, nota média, top 5 pedidos
3. **View** `v_alerta_metas` — por unidade: receita acumulada do mês, meta, % atingido, dias restantes. Consumida pelo n8n.

### Seed

5 unidades (4 ativas, 1 inativa), ~4.000 pedidos em 6 meses com sazonalidade (fim de semana +40%, mix por plataforma, cancelamento maior no iFood), metas mensais (1 unidade propositalmente abaixo de 60% no mês corrente para demonstrar o alerta), 15 funcionários, ~35% dos pedidos entregues com avaliação (incluindo algumas notas ≤ 2 recentes para o workflow 2). Script SQL idempotente versionado em `supabase/seed.sql`.

## 2. Frontend

### Identidade "Sabor & Cia"

Paleta quente (terracota #C4552D + off-white/carvão), logo fictício SVG (garfo/chama), tipografia Inter + display (ex. Sora). Dark mode desde o início (tokens CSS, não retrofit).

### Telas

1. **Login** — e-mail/senha (Supabase Auth), redirect por role.
2. **Dashboard Geral** (gestor): gauge receita mês vs. meta consolidada; barras agrupadas 6 meses por unidade; cards de ticket médio; taxa de cancelamento por plataforma; ranking por faturamento; **filtro de período**; badge de alertas (tabela `alertas` via Realtime).
3. **Dashboard da Unidade** (gerente): lista de pedidos do dia (valor, plataforma, status) **atualizando ao vivo via Supabase Realtime**; receita mês vs. meta; nota média do mês; top 5 pedidos por valor.

### Requisitos transversais

Responsivo (mobile-first nos cards), loading/empty states, export CSV/PDF dos relatórios (react-to-print ou jsPDF + export CSV client-side), toggle dark mode persistido.

## 3. Automação (n8n Cloud) — 2 workflows

### WF1 — `alerta-meta-diaria` (requisito + IA)

1. **Schedule Trigger** — diário 08:00 America/Sao_Paulo
2. **Postgres node** — `select * from v_alerta_metas where pct_meta < 0.6 and dias_restantes <= 10`
3. **Dedupe** — query em `alertas`: já existe alerta tipo `meta` para unidade+mês? Se sim, encerra.
4. **LLM node (Claude API)** — recebe KPIs da unidade e gera diagnóstico de 3–4 linhas com hipótese de causa e sugestão de ação
5. **Insert** em `alertas` (tipo `meta`, mensagem = diagnóstico, payload = KPIs)
6. **E-mail** ao gestor geral com o diagnóstico

*Racional: o requisito pede um alerta; entregá-lo com diagnóstico gerado por IA conversa diretamente com o posicionamento da IAplicada.*

### WF2 — `alerta-avaliacao-ruim` (evento, não schedule)

1. **Webhook node** ← Supabase Database Webhook em INSERT de `avaliacoes` (header secret para autenticação)
2. **IF** nota ≤ 2
3. **Enriquecimento** — busca pedido, unidade e gerente
4. **Insert** em `alertas` (tipo `avaliacao`) + e-mail ao gerente da unidade

*Demonstra os dois padrões de automação (schedule e event-driven) e fecha o loop com o Realtime do frontend: avaliação ruim entra → alerta aparece ao vivo no dashboard.*

### Documentação (`automations/README.md` + JSONs exportados)

Como configurar em produção: credenciais via variáveis de ambiente do n8n, secret do webhook, error workflow com retry/backoff, timezone, política de dedupe, screenshot dos workflows.

## 4. Deploy e repositório

- Vercel (frontend), variáveis `VITE_SUPABASE_URL`/`ANON_KEY`.
- Repo público: `README.md` (descrição, stack e justificativa, link deploy, credenciais de teste dos dois perfis, decisões técnicas e trade-offs, screenshots dos workflows, "o que faria diferente"), `supabase/` (migrations + seed), `automations/` (JSONs + README), commits organizados por etapa.

## Decisões e trade-offs (para o README)

- Agregações via RPC no Postgres (não no cliente): performance e única fonte de verdade.
- IA chamada pelo n8n, nunca pelo frontend: API key não vai ao cliente.
- `profiles` + funções security definer em vez de custom claims JWT: mais simples de auditar no prazo do teste.
- Seed inclui casos que demonstram os workflows (unidade abaixo da meta, avaliações ruins).

## Fora de escopo (YAGNI)

CRUD de pedidos/unidades, workflow 3 (insight sob demanda — citar no "faria diferente"), relatório semanal PDF via n8n, multi-idioma, testes E2E.
