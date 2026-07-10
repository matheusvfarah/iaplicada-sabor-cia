# Automações (n8n Cloud)

Quatro workflows exportados como JSON (`Workflows → Import from File` no n8n):

| Workflow                                                       | Gatilho                                   | Descrição                                                                                           |
| -------------------------------------------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------- |
| [`alerta-meta-diaria.json`](./alerta-meta-diaria.json)         | Schedule (08:00 America/Sao_Paulo)        | **Requisito do teste.** Consulta `v_alerta_metas`, gera diagnóstico via Claude API e insere em `alertas` + e-mail ao gestor |
| [`alerta-avaliacao-ruim.json`](./alerta-avaliacao-ruim.json)   | Webhook (Supabase Database Webhook)       | Nota ≤ 2 dispara alerta imediato ao gerente da unidade (padrão event-driven)                        |
| [`simulador-pedidos.json`](./simulador-pedidos.json)           | Schedule (curto, com sorteio de execução) | Simula pedidos chegando pela mesma API que um integrador real usaria (adicional, fora do requisito) |
| [`gerar-notificacoes.json`](./gerar-notificacoes.json)         | Schedule (a cada 1 minuto)                | Chama a RPC `gerar_notificacoes()` — cancelamento automático e aviso de pedido atrasado (fallback do `pg_cron`, ver WF4 abaixo) |

## WF1 — `alerta-meta-diaria` (requisito + IA)

Fluxo: **Schedule 08:00** → **Postgres**: query em `v_alerta_metas` filtrando `pct_meta < 0.6 and dias_restantes <= 10`, com dedupe embutido no SQL (`not exists` em `alertas` tipo `meta` do mês corrente — um alerta por unidade/mês, mesmo rodando todo dia) → **HTTP**: Claude API gera diagnóstico de 4 linhas (situação, hipótese de causa, ação recomendada) a partir dos KPIs → **Postgres**: insere em `alertas` (aparece no sino/painel do gestor via realtime) → **E-mail** ao gestor.

Racional: o requisito pede "envie um alerta"; entregamos o alerta com diagnóstico gerado por IA — coerente com o posicionamento da IAplicada. Se a Claude API falhar, o node "Prepara alerta" tem fallback com mensagem factual sem IA (o alerta nunca deixa de sair).

**Demo:** o seed deixa a unidade Santana abaixo de 60% da meta. Como o gatilho de dias (`dias_restantes <= 10`) pode não bater no dia da avaliação, execute manualmente (`Execute Workflow`) após ajustar temporariamente o filtro para `dias_restantes <= 31`, ou aguarde a janela real.

## WF2 — `alerta-avaliacao-ruim` (event-driven)

Fluxo: **Webhook** ← Supabase Database Webhook em INSERT de `avaliacoes` → **Code**: valida o header `x-webhook-secret` e filtra nota ≤ 2 → **Postgres**: enriquece com pedido/unidade → insere em `alertas` (badge aparece ao vivo no painel) → **E-mail** ao gerente.

**Configurar no Supabase:** Database → Webhooks → Create: tabela `avaliacoes`, evento INSERT, URL = a Production URL do node Webhook do n8n, HTTP Headers com `x-webhook-secret` = mesmo valor de `SUPABASE_WEBHOOK_SECRET` no n8n.

**Demo:** inserir uma avaliação nota 1 pelo SQL editor → alerta aparece no painel em segundos.

## WF4 — `gerar-notificacoes` (cron de atraso/cancelamento)

Fluxo: **Schedule a cada 1 minuto** → **Postgres**: `select gerar_notificacoes();`.

`gerar_notificacoes()` (`supabase/migrations/20260714000020_gerar_notificacoes.sql`) cancela automaticamente pedidos parados em `pendente` além do limite da unidade e insere notificação `pedido_atrasado` para o gerente da unidade + todos os `gestor_geral` quando um pedido em `preparando` estoura `limite_atraso_min`. A função em si não roda sozinha — precisa de um `pg_cron` (só em plano pago do Supabase) ou deste workflow chamando a RPC a cada minuto. Sem um dos dois, o card do pedido fica com o ícone de atraso (isso é só cálculo visual no cliente) mas nenhuma notificação real é criada — nem toast, nem sino, nem badge da sidebar.

**Dedupe:** já embutido na tabela (`uniq_notificacao_pedido`), então rodar a cada minuto não duplica notificação para o mesmo pedido/destinatário.

**Demo:** deixar um pedido em `preparando` além do `limite_atraso_min` da unidade (seed ou update manual) → rodar o workflow manualmente (`Execute Workflow`) ou esperar até 1 min → notificação aparece no sino/toast do gerente e dos gestores gerais.

## Credenciais e variáveis (n8n)

Criar após importar (os JSONs referenciam por nome, nunca hardcoded):

| Credencial/variável | Uso |
| --- | --- |
| Credencial Postgres `Supabase Sabor & Cia (Postgres)` | WF1, WF2 e WF4 (host/porta/senha do Supabase → Database Settings; usar o pooler em `Session mode`) |
| Credencial SMTP `SMTP Sabor & Cia` | nodes de e-mail (qualquer SMTP de teste; Mailtrap serve para a demo) |
| `ANTHROPIC_API_KEY` | WF1 — diagnóstico via Claude |
| `EMAIL_GESTOR` | destinatário dos alertas |
| `SUPABASE_WEBHOOK_SECRET` | WF2 — autenticação do Database Webhook |
| `APP_URL` + `ORDER_SIMULATOR_SECRET` | WF3 — ver seção do simulador |

## Produção (como eu configuraria de verdade)

- **Credenciais** sempre em credentials/variáveis do n8n — os JSONs do repo não contêm nenhum secret.
- **Error workflow** global: capturar falha de qualquer node → notificar canal de ops; HTTP nodes com retry (2x, backoff) para instabilidade de rede.
- **Dedupe** no banco (SQL), não em memória do n8n — sobrevive a restart e a execuções concorrentes.
- **Timezone** fixado em America/Sao_Paulo nos settings de cada workflow (cron do n8n Cloud roda em UTC por padrão).
- **Kill switch:** o toggle Ativo/Inativo de cada workflow; o simulador fica DESLIGADO por padrão e é ativado só para demonstração.

### `simulador-pedidos` — adicional (fora do escopo original)

Decisão consciente de expandir o escopo além do exigido: em vez de só o badge
de alertas, os pedidos "chegam" simulados por um cron do n8n, aparecem como
popup de aceite/recusa pro gerente (com os itens e disponibilidade atual do
cardápio), fechando um loop de operação mais realista.

Workflow pronto pra importar em **[`simulador-pedidos.json`](./simulador-pedidos.json)**
(`Workflows → Import from File` no n8n). 5 nodes:

1. **Schedule Trigger** — a cada 2 min. n8n não tem "intervalo aleatório"
   nativo sem um loop de Wait, então a aleatoriedade fica no node seguinte.
2. **Code — "Sorteia disparo e plataforma"** — ~40% de chance de realmente
   virar um pedido nessa execução (senão retorna `[]` e a cadeia para ali);
   sorteia a plataforma (`ifood`/`rappi`/`proprio`, pesos do seed).
3. **HTTP Request — "Consulta status da rede"** — `GET /api/status` no
   servidor do app (header `x-webhook-secret`). O integrador NUNCA toca o
   banco: o servidor responde quais unidades estão ativas, **abertas agora**
   (pelo horário de funcionamento) e o cardápio disponível de cada uma
   (respeitando itens pausados) — exatamente como uma vitrine pública.
4. **Code — "Monta pedido pela vitrine"** — filtra unidades abertas com
   cardápio, sorteia a unidade, 1 a 4 itens distintos e quantidades (1–3).
   Rede fechada ⇒ nenhum pedido nasce fora do horário.
5. **HTTP Request — "Envia pedido simulado"** — `POST` em
   `{{ $env.APP_URL }}/api/pedidos/simular`, header `x-webhook-secret`.

O endpoint (implementado em `src/server.ts` /
`src/lib/order-simulator-handler.ts`) valida o secret, calcula o valor a
partir do preço atual do cardápio (nunca confia no payload) e insere o
pedido com status `pendente` via RPC atômica (`rpc_inserir_pedido_simulado`).
O pedido aparece **ao vivo** (Supabase Realtime) como popup no Dashboard da
Unidade — o gerente aceita (`recebido`) ou recusa (`cancelado`, populando
`log_cancelamentos` via trigger já existente).

**Variáveis de ambiente do n8n** (`Settings → Environments` ou variáveis do
workflow, nunca hardcoded nos nodes):

| Variável                 | Valor                                                       |
| ------------------------ | ----------------------------------------------------------- |
| `SUPABASE_URL`           | mesma de `VITE_SUPABASE_URL` no `.env` do app               |
| `SUPABASE_ANON_KEY`      | mesma de `VITE_SUPABASE_ANON_KEY` (pública, só lê cardápio) |
| `APP_URL`                | URL do deploy (Vercel) ou túnel local (ex. ngrok) em dev    |
| `ORDER_SIMULATOR_SECRET` | mesmo valor configurado no servidor do app                  |

O JSON foi validado como sintaticamente correto e revisado nó a nó contra o
schema desta versão do n8n — a importação (`n8n import:workflow` ou
`Workflows → Import from File`) e a ativação ficam pro ambiente onde o cron
vai rodar de verdade (local ou n8n Cloud), propositalmente fora do escopo
automatizado aqui.

### Contrato do endpoint `/api/pedidos/simular`

**Por que uma rota no próprio app em vez de uma Supabase Edge Function:**
o app já roda num handler `fetch` central (`src/server.ts`, usado pelo
TanStack Start/Nitro em produção) — interceptar um path ali é uma linha a
mais de código e reaproveita o mesmo deploy (Vercel), sem precisar gerenciar
um segundo artefato de deploy (a Edge Function do Supabase), uma segunda
env var store, e um segundo CLI de deploy. Como o app já é servido via SSR
com um servidor de verdade por trás (não é um SPA estático), essa rota
"custa" a mesma infra que já existe. O trade-off: se o app cair, o endpoint
cai junto (com uma Edge Function eles seriam independentes) — aceitável
pro escopo do teste.

**Request**

```
POST /api/pedidos/simular
Content-Type: application/json
x-webhook-secret: <ORDER_SIMULATOR_SECRET>

{
  "unidade_id": 1,
  "plataforma": "ifood",
  "itens": [
    { "produto_id": 3, "quantidade": 2 }
  ]
}
```

- `plataforma`: `"ifood" | "rappi" | "proprio"`
- `itens`: 1 a 10 itens, `produto_id` deve existir, pertencer à `unidade_id`
  informada e estar com `disponivel = true` — item pausado é rejeitado.
- O servidor busca o `preco` atual de cada produto e calcula o `valor` do
  pedido — o preço enviado no payload (se enviado) é ignorado.
- O `codigo` (ex. `#341A`) é gerado automaticamente pelo banco a partir do
  `id` do pedido (coluna `generated always as`) — o n8n não precisa (nem
  consegue) enviá-lo.
- Pedido entra com status `pendente` (fluxo de aceite/recusa via popup no
  Dashboard da Unidade, não `recebido` direto — ver decisão acima).

**Responses**

| Status | Corpo                                                               | Quando                                         |
| ------ | ------------------------------------------------------------------- | ---------------------------------------------- |
| `201`  | `{ "id": 13425 }`                                                   | Pedido criado com sucesso                      |
| `400`  | `{ "error": "invalid payload", "issues": [...] }`                   | Corpo não bate com o schema (zod)              |
| `400`  | `{ "error": "produto X indisponível ou não pertence à unidade Y" }` | Item pausado, inexistente ou de outra unidade  |
| `401`  | `{ "error": "unauthorized" }`                                       | Header `x-webhook-secret` ausente ou incorreto |
| `405`  | `{ "error": "method not allowed" }`                                 | Método diferente de `POST`                     |
| `500`  | `{ "error": "ORDER_SIMULATOR_SECRET não configurado no servidor" }` | Variável de ambiente ausente no deploy         |

## Nesta pasta (quando concluído)

- `*.json` — workflows exportados do n8n
- Screenshots dos workflows
- Documentação de configuração em produção (variáveis de ambiente, secret do webhook, error workflow, timezone, política de dedupe)
