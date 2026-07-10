# Sabor & Cia — Painel Operacional

> Teste técnico Dev No-Code — IAplicada. Dashboard para gestão de uma rede de dark kitchens: performance de unidades, pedidos em tempo real, receita, metas e alertas automatizados.

**Deploy:** [https://iaplicada-sabor-cia.vercel.app](https://iaplicada-sabor-cia.vercel.app)

## Credenciais de teste

| Perfil             | E-mail                          | Senha          | Enxerga                                                     |
| ------------------- | -------------------------------- | --------------- | ------------------------------------------------------------ |
| Gestor Geral        | gestor@saborecia.com.br          | x9K7qkB6GgwQXw  | Todas as unidades, `/rede/*`, alertas, metas de todas as lojas |
| Gerente de Unidade  | gerente.centro@saborecia.com.br  | lVaZMjXfDJR33E  | Só a própria unidade (Centro), `/unidade/1/*`                |

## Por que este projeto existe

O enunciado pedia um painel operacional para uma rede de dark kitchens, com pedidos, métricas de performance e ao menos um alerta automatizado ("meta em risco"). A decisão de design que atravessa o projeto inteiro foi: **tratar isso como um sistema operacional de verdade, não uma maquete de dashboard.** Isso significa:

- Pedidos não são uma tabela estática de demonstração — eles **nascem** via uma API (como um integrador iFood/Rappi faria de verdade), passam por um fluxo de aceite/recusa com timeout, viram produção, atrasam se ninguém mexer, são cancelados automaticamente se ignorados, e geram avaliação de cliente depois de entregues.
- O banco é a fonte de verdade e o ponto de imposição de regras (RLS, triggers, constraints), não o frontend — um gerente não consegue ver pedido de outra unidade nem porque o componente escondeu o botão, mas porque a política de Postgres bloqueia a linha.
- Automação (n8n) e agendamento (`pg_cron`) resolvem o que é responsabilidade de orquestração externa (disparar um GET todo dia às 8h, mandar e-mail), e o banco resolve o que é regra de negócio (dedupe, idempotência, quem pode ver o quê) — a linha entre as duas coisas é deliberada, não incidental.

## Arquitetura

```
                         ┌─────────────────────┐
                         │   n8n Cloud (cron)   │
                         │  WF1: alerta de meta │
                         │  WF3: simula pedidos │
                         └──────────┬───────────┘
                                    │ HTTPS + x-webhook-secret
                                    ▼
┌───────────────────────────────────────────────────────────┐
│  Vercel — TanStack Start (SSR)                             │
│  ┌─────────────┐  ┌──────────────────────────────────┐    │
│  │  src/server  │  │  Rotas de página (React Router)   │    │
│  │  .ts (fetch  │  │  /login /rede/* /unidade/:id/*    │    │
│  │  handler)    │  │  (Dashboard, Pedidos, Cardápio,   │    │
│  │              │  │  Avaliações, Funcionários, Config)│    │
│  │  intercepta  │  └──────────────┬─────────────────────┘   │
│  │  /api/*      │                 │ supabase-js (anon key)  │
│  └──────┬───────┘                 │ RLS aplica por sessão   │
└─────────┼──────────────────────────┼─────────────────────────┘
          │ service_role             │
          ▼                          ▼
┌───────────────────────────────────────────────────────────┐
│  Supabase (Postgres + Auth + Realtime)                      │
│  • RLS em toda tabela sensível (gestor vs. gerente)          │
│  • Triggers: transição de status, timestamps, notificações   │
│  • RPCs: toda escrita "de negócio" passa por função           │
│    security definer, nunca INSERT/UPDATE cru do client       │
│  • pg_cron: gerar_notificacoes() e simular_avaliacoes()       │
│    rodam sozinhas, a cada minuto, sem depender de nada externo│
│  • Realtime: pedidos, alertas, notificacoes — o client        │
│    assina e reage (popup, toast, badge) sem polling           │
└───────────────────────────────────────────────────────────┘
```

Duas rotas HTTP (`/api/status`, `/api/pedidos/simular`, `/api/alertas/metas-em-risco`, `/api/alertas/metas`) são interceptadas em `src/server.ts` antes de chegar no handler SSR do TanStack Start — é a "porta de entrada" server-only que usa a `service_role` key do Supabase (nunca exposta ao cliente) para deixar o n8n operar sem tocar no Postgres diretamente e sem precisar de nenhuma variável de ambiente própria (o plano de n8n em uso não libera `$env.*` — todo segredo vira Credential, ver `automations/README.md`).

## Modelo de dados (visão geral)

| Tabela | O quê | Observação |
| --- | --- | --- |
| `unidades` | Lojas da rede | Horário de funcionamento, tempo limite de aceite, limite de atraso — tudo configurável por unidade |
| `profiles` | Usuários (1:1 com `auth.users`) | `role`: `gestor_geral` ou `gerente`; gerente tem `unidade_id` fixo |
| `produtos` / `cardapio_unidade` | Catálogo e disponibilidade por loja | Item pode estar pausado numa unidade sem afetar as outras |
| `pedidos` | O centro do sistema | Máquina de estados: `pendente → recebido/preparando → entregue`, ou `→ cancelado` a qualquer ponto anterior a `entregue` |
| `pedido_itens` | Itens de cada pedido | Preço travado no momento da venda (nunca recalcula com o preço atual do cardápio) |
| `avaliacoes` | Nota (1-5) por pedido | 1 avaliação por pedido (`unique`), gerada pelo simulador ou por um cliente real no futuro |
| `metas` | Meta de receita/pedidos por unidade/mês | Editável só pelo gestor, só do mês atual/futuro |
| `alertas` | Alertas "de painel" (`meta`, `avaliacao`) | Pull — só aparece em `/rede/alertas`, sem push |
| `notificacoes` | Notificações "em tempo real" por usuário | Push — toast + som + sino + badge, via Realtime |
| `log_cancelamentos` | Auditoria de todo pedido cancelado | Alimentado por trigger, nunca escrito manualmente |
| `funcionarios` | Equipe de cada unidade | Gerente só mexe na própria unidade (RLS) |

Toda regra que importa (transição de status válida, quem pode editar o quê, dedupe de notificação, cálculo de valor do pedido a partir do preço real) mora em **migration SQL** (`supabase/migrations/`), não em código de aplicação — 31 migrations, cada uma com um comentário de cabeçalho explicando o "porquê", não só o "o quê".

## Dois sistemas de aviso — e por que são diferentes de propósito

Esse foi um ponto de confusão real durante o desenvolvimento, então vale documentar explicitamente:

- **`alertas`** (tabela mais antiga): alimenta só a tela `/rede/alertas`, exclusiva do gestor. É **pull** — sem toast, sem som, sem badge. Pensa nela como uma caixa de entrada que ninguém avisa que chegou algo.
- **`notificacoes`**: tem um provider global (`NotificacoesProvider`) montado no shell do app, presente em qualquer tela. É **push** — Realtime dispara toast + som + sino + badge na hora, para o gerente da unidade e/ou todos os gestores gerais, dependendo do tipo.

Avaliação ruim, por exemplo, grava nas duas: em `alertas` (histórico consultável) e em `notificacoes` (avisa na hora). Pedido novo, atrasado e cancelamento automático só usam `notificacoes` (não fazem sentido como "histórico de painel").

## Fluxo de um pedido, do nascimento ao fechamento

1. **Nasce** via `POST /api/pedidos/simular` (integrador externo — hoje o workflow n8n WF3) com status `pendente`. O servidor calcula o valor a partir do preço **atual** do cardápio — nunca confia no payload.
2. **Populariza um popup** no Dashboard da unidade em tempo real (Supabase Realtime, canal filtrado por `unidade_id`), com alarme sonoro em loop enquanto estiver aberto e um countdown de recusa automática (`tempo_limite_aceite_min`, configurável por unidade). Se o gerente ignorar, o próprio client recusa automaticamente quando o tempo estoura.
3. **Aceite** manda direto pra `preparando` (pula o estágio intermediário `recebido` — decisão tomada depois de perceber que o duplo clique não agregava nada ao fluxo real). Dispara notificação `pedido_novo` **no nascimento como `pendente`**, não no aceite — outro ajuste feito depois de notar que a notificação chegava "atrasada" em relação ao popup.
4. **Atraso**: se ficar em `preparando` além de `limite_atraso_min`, o cron `gerar_notificacoes()` (roda a cada minuto via `pg_cron`) avisa o gerente e todos os gestores.
5. **Entrega** (`entregue`) fecha o ciclo operacional e abre o de avaliação: 30 segundos depois, o cron `simular_avaliacoes()` tem 20% de chance de gerar uma nota aleatória (1-5) pro pedido. Nota ≤ 2 notifica o gerente + gestores na hora.
6. **Cancelamento** (manual ou automático por timeout) sempre passa por um trigger que popula `log_cancelamentos` — nenhum cancelamento é "silencioso".

Nada nesse fluxo depende de o usuário estar com a tela aberta — é tudo orientado a evento/cron no banco, o client só reflete o que já aconteceu.

## API HTTP (server-only, nunca chamada pelo client)

Todas protegidas por header `x-webhook-secret` comparado contra uma env var própria (nunca reaproveitada entre endpoints), implementadas em `src/lib/*-handler.ts` e interceptadas em `src/server.ts` antes do SSR.

| Rota | Método | Consumidor | Faz |
| --- | --- | --- | --- |
| `/api/status` | GET | n8n WF3 | Unidades abertas agora + cardápio disponível (vitrine pública) |
| `/api/pedidos/simular` | POST | n8n WF3 | Cria pedido `pendente`, calcula valor a partir do preço real, valida item disponível/pertence à unidade |
| `/api/alertas/metas-em-risco` | GET | n8n WF1 | Unidades com `pct_meta < 60%` e `dias_restantes <= 10`, já sem quem recebeu alerta esse mês |
| `/api/alertas/metas` | POST | n8n WF1 | Registra alerta de meta; idempotente (roda 2x no mesmo dia, não duplica) |

Contratos completos (request/response, códigos de erro) em `automations/README.md`.

## Automação (n8n) e cron no banco

Dois workflows n8n, documentados nó a nó com racional de cada decisão em `automations/README.md`:

- **WF1 — `alerta-meta-diaria`**: Schedule 08:00 → GET unidades em risco → monta mensagem (texto factual, sem IA — decisão consciente de manter simples) → POST registra o alerta (idempotente) → só manda e-mail (fictício) se o registro foi novo.
- **WF3 — `simulador-pedidos`**: Schedule a cada 2 min, ~40% de chance de virar pedido, consulta a vitrine pública (`/api/status`) e faz nascer um pedido de verdade, fechando o loop de operação (fora do escopo original, adicionado pra a demo ser navegável sem esperar pedidos reais).

Nenhum dos dois workflows conecta direto no Postgres nem usa `$env.*` — todo acesso a dado é HTTP na própria API do app, todo segredo é uma Credential do n8n (o plano em uso não libera variável de ambiente).

Atraso de pedido, cancelamento automático e avaliação simulada **não usam n8n** — rodam via `pg_cron` direto no Supabase (`gerar_notificacoes()`, `simular_avaliacoes()`, a cada minuto), porque adicionar uma dependência externa pra algo que o próprio Postgres resolve sozinho não se justificava.

## Segurança e RLS

- Toda tabela sensível tem Row Level Security ligado; gerente só enxerga a própria unidade (`unidade_id = get_my_unidade()`), gestor geral enxerga tudo.
- Toda escrita "de negócio" (inserir pedido, resolver avaliação, gerar notificação) passa por função `security definer` — nunca um INSERT cru vindo do client sem passar por validação de regra.
- As duas chaves de serviço (`SUPABASE_SERVICE_ROLE_KEY`, secrets de webhook) só existem no servidor (`src/lib/supabase-admin.ts`, comentado explicitamente "nunca importar de componente/rota de cliente") — nunca chegam ao bundle do navegador.
- Cada endpoint HTTP público tem seu próprio secret (não reaproveita o mesmo entre simulador de pedidos e alerta de meta), então revogar um não derruba o outro.

## Testes

`supabase/validate-sql.mjs` roda **todas as 31 migrations + o seed** num Postgres local via PGlite (WASM, sem depender de Docker/instância real) e valida: schema aplica sem erro, triggers de transição de status, RLS por role (gestor vê tudo / gerente só a própria unidade, testado com usuários fake e `set role`), RPCs (incluindo dedupe/idempotência de notificação, alerta e avaliação), cálculo de virada de horário cruzando meia-noite. Roda em segundos, sem custo de infra, e é o gate antes de qualquer migration ir pro banco real:

```bash
cd supabase && node validate-sql.mjs
```

## Rodando localmente

```bash
npm install
cp .env.example .env   # preencher com as credenciais do seu projeto Supabase
npm run dev
```

Variáveis necessárias em `.env` — ver `.env.example` para a lista completa e o propósito de cada uma (Supabase, secrets dos webhooks de n8n). Nenhuma delas é lida pelo n8n via `$env.*`; são só do servidor do app (Vercel/local).

## Estrutura

```
src/
  routes/            # Páginas (TanStack Router): login, /rede/*, /unidade/:id/*
  components/        # UI compartilhada (shell, sidebar, popup de pedido, sino de notificações)
  lib/                # Handlers server-only (*-handler.ts), hooks de dados (use-*.ts),
                      # auth, formatação, cliente Supabase (anon e admin)
  server.ts           # Entry HTTP: intercepta /api/* antes do SSR

supabase/
  migrations/         # Schema, RLS, triggers, RPCs, views — 31 arquivos, cada um com
                      # comentário de cabeçalho explicando o porquê da mudança
  seed.sql            # Dados de demonstração (~13k pedidos, 6 meses, 5 unidades)
  validate-sql.mjs    # Suite de testes local (PGlite) — migrations + seed + RLS + RPCs

automations/          # Workflows n8n exportados (JSON) + README com contrato de cada
                      # endpoint que eles consomem e racional de cada decisão de design
```

## Decisões técnicas e trade-offs (resumo)

- **Aceite pula `recebido` e vai direto pra `preparando`**: o duplo clique (aceitar no popup, depois aceitar de novo no kanban) não agregava nada ao fluxo real — o popup já é a decisão.
- **`alertas` vs. `notificacoes` como sistemas separados**: manter os dois em vez de unificar foi deliberado — `alertas` é histórico de painel (gestor), `notificacoes` é push operacional (gerente + gestor). Unificar teria misturado semânticas diferentes (o que precisa de ação imediata vs. o que é só registro).
- **Sem diagnóstico via LLM no alerta de meta**: a primeira versão chamava a Claude API pra gerar um texto mais rico; removido depois de concluir que não agregava ao requisito ("envie um alerta") e só adicionava custo, latência e mais uma credential pra gerenciar.
- **`/api/pedidos/simular` e `/api/alertas/metas` no mesmo deploy do app** (não uma Supabase Edge Function ou serviço separado): reaproveita a infra SSR que já existe, sem gerenciar um segundo artefato de deploy. Trade-off aceito: se o app cair, os webhooks caem junto — ver seção abaixo pra como eu resolveria isso com mais tempo.
- **RNG de avaliação simulada roda no banco (`pg_cron`), não em código de aplicação**: sobrevive a redeploy, não depende de nenhum processo do Node ficar de pé, e o dedupe (`avaliacao_sorteada`) é garantido por schema, não por lógica de app que pode ter race condition.

## O que faria diferente com mais tempo

Escopo real e cortes conscientes >  simular acabamento. Isso aqui é a lista honesta do que ficou de fora e por quê — e o que eu priorizaria numa segunda iteração, em ordem aproximada de valor/esforço:

**Tela de teste para simular pedidos e avaliações manualmente.** Hoje pedido e avaliação nascem só via cron/n8n (`WF3` a cada 2 min com 40% de chance, `simular_avaliacoes()` com 20% de chance) — ótimo pra simular tráfego orgânico, péssimo pra demo ou QA dirigido ("quero ver AGORA um pedido atrasado" ou "preciso de uma avaliação nota 1 pra testar o alerta"). Uma tela `/dev/simulador`, visível só pro gestor geral (ou atrás de uma flag), com botões "criar pedido pendente na unidade X", "forçar avaliação nota Y no pedido Z", "avançar relógio de um pedido pra simular atraso" — isso teria acelerado cada rodada de teste desta própria conversa (em vez de eu ficar consultando o banco direto por psql pra confirmar comportamento). Reaproveitaria as mesmas RPCs que já existem (`rpc_inserir_pedido_simulado`, `rpc_registrar_alerta_meta`), só expondo um formulário em cima.

**Separar as integrações externas em outro serviço/deploy.** Hoje `/api/pedidos/simular`, `/api/status` e os dois endpoints de alerta de meta rodam dentro do mesmo processo Vercel que serve o painel via SSR — decisão consciente de simplicidade pro escopo do teste, mas com um custo real: se o app cair (deploy quebrado, erro de build, cold start pesado), as integrações caem junto, e qualquer pico de tráfego de webhook (imagina 50 integradores de delivery mandando pedido ao mesmo tempo, não só o simulador) compete por recurso com quem está navegando o painel. Com mais tempo, isso viraria um serviço à parte — um pequeno worker (Cloudflare Workers, um Fly.io/Railway dedicado, ou Supabase Edge Functions) só para os webhooks de entrada, publicando num canal (fila leve tipo um `pg_notify`/tabela de outbox, ou algo como um Redis/SQS se o volume justificar) que o painel consome via Realtime como já faz. Isso desacopla disponibilidade ("o painel caiu" não devia significar "perdemos pedidos") e permite escalar cada lado independente (o painel é baixo tráfego/alto valor por request; um endpoint de webhook de pedido é alto tráfego/baixo valor por request, perfil de infra bem diferente).
- Nessa mesma linha: **fila com retry/dead-letter** pros webhooks — hoje se `/api/pedidos/simular` falhar (rede, timeout), o n8n reporta erro mas não há reprocessamento automático nem log centralizado de "esse pedido nunca chegou". Um outbox pattern ou uma fila de verdade resolveria isso com garantia de entrega.

**Integração real com plataformas de delivery.** O simulador imita o formato que um integrador real (iFood, Rappi) mandaria, mas é sintético. O próximo passo natural é um adaptador por plataforma (cada uma tem formato de webhook e autenticação diferentes) que normaliza pro mesmo contrato interno (`POST /api/pedidos/simular` já é, na prática, esse contrato normalizado) — a arquitetura já está pronta pra isso, só falta o tradutor de cada lado.

**Observabilidade de verdade.** Hoje um erro em produção (uma RPC falhando, um webhook do n8n com secret errado, o `pg_cron` parando de rodar) só aparece se alguém for procurar manualmente (como fiz nesta conversa, consultando `cron.job_run_details` via psql). Com mais tempo: Sentry (ou equivalente) capturando erro de servidor e de client, um alerta próprio se `pg_cron` parar de reportar sucesso por mais de N minutos (monitorar o monitor), e um dashboard simples de saúde do sistema (última execução de cada cron job, taxa de erro dos endpoints de webhook).

**Testes E2E, não só validação de SQL.** `validate-sql.mjs` cobre schema/RLS/RPC muito bem, mas não existe nenhum teste automatizado do fluxo completo pela UI (login → popup de pedido aparece → aceitar → aparece no kanban → finalizar → avaliação eventualmente aparece). Playwright cobrindo os fluxos críticos (aceite/recusa de pedido, permissões de gerente vs. gestor) evitaria que uma regressão de frontend passasse despercebida — hoje isso só é pego manualmente, como fizemos ao longo desta sessão.

**Ambiente de staging separado da produção.** Hoje as migrations foram aplicadas direto no banco de produção via `psql` durante o desenvolvimento (com confirmação explícita a cada uma, mas ainda assim produção) — funcional pro escopo do teste, mas não é o fluxo que eu recomendaria pra um sistema real. O certo é um projeto Supabase de staging, `supabase db push` de verdade (que também mantém `supabase_migrations.schema_migrations` sincronizado — hoje as migrations 027-031 foram aplicadas via `psql` direto e **não estão registradas nessa tabela de controle**, um gap real que só não vira problema porque não há ninguém rodando `supabase db push` nesse projeto ainda) e promoção de staging pra produção via CI, não um humano rodando SQL manualmente.

**RBAC mais granular.** Hoje só existem dois papéis (`gerente`, `gestor_geral`). Uma rede maior provavelmente quer papéis intermediários — um "supervisor regional" que vê um subconjunto de unidades, um "financeiro" que só vê receita/metas sem poder mexer em pedidos. A RLS já está estruturada de um jeito que comportaria isso (é baseada em função + comparação de unidade, não em `if` espalhado pelo client), só faltaria desenhar a tabela de permissões.

**Página de acompanhamento pro cliente final.** O pedido tem `codigo` gerado (`#341A`) mas não existe nenhuma tela pública tipo "acompanhe seu pedido" — faria sentido numa versão mais completa do produto, reaproveitando o mesmo Realtime que já move o popup do gerente.

**PWA / app do gerente.** O painel é responsivo, mas rodar o dia inteiro numa cozinha provavelmente pede um app instalável com notificação push nativa (Web Push API) em vez de depender da aba do navegador estar aberta pro toast/som funcionar — hoje se o gerente fecha a aba, perde o alarme do popup de pedido novo.
