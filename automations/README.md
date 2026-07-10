# Automações (n8n Cloud)

Dois workflows exportados como JSON (`Workflows → Import from File` no n8n):

| Workflow                                                | Gatilho                                   | Descrição                                                                                                                   |
| -------------------------------------------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------- |
| [`alerta-meta-diaria.json`](./alerta-meta-diaria.json) | Schedule (08:00 America/Sao_Paulo)        | **Requisito do teste.** Consulta `v_alerta_metas`, gera diagnóstico via Claude API e insere em `alertas` + e-mail ao gestor |
| [`simulador-pedidos.json`](./simulador-pedidos.json)   | Schedule (curto, com sorteio de execução) | Simula pedidos chegando pela mesma API que um integrador real usaria (adicional, fora do requisito)                        |

Avaliação ruim, atraso de pedido e cancelamento automático **não dependem de n8n** — rodam direto no banco via `pg_cron` (ver seção "Cron no banco" abaixo). Não há workflow n8n pra eles.

## WF1 — `alerta-meta-diaria` (requisito + IA)

Fluxo: **Schedule 08:00** → **Postgres**: query em `v_alerta_metas` filtrando `pct_meta < 0.6 and dias_restantes <= 10`, com dedupe embutido no SQL (`not exists` em `alertas` tipo `meta` do mês corrente — um alerta por unidade/mês, mesmo rodando todo dia) → **HTTP**: Claude API gera diagnóstico de 4 linhas (situação, hipótese de causa, ação recomendada) a partir dos KPIs → **Postgres**: insere em `alertas` (aparece no sino/painel do gestor via realtime) → **E-mail** ao gestor.

Racional: o requisito pede "envie um alerta"; entregamos o alerta com diagnóstico gerado por IA — coerente com o posicionamento da IAplicada. Se a Claude API falhar, o node "Prepara alerta" tem fallback com mensagem factual sem IA (o alerta nunca deixa de sair).

**Demo:** o seed deixa a unidade Santana abaixo de 60% da meta. Como o gatilho de dias (`dias_restantes <= 10`) pode não bater no dia da avaliação, execute manualmente (`Execute Workflow`) após ajustar temporariamente o filtro para `dias_restantes <= 31`, ou aguarde a janela real.

## Cron no banco (sem n8n): atraso, cancelamento e avaliação simulada

Fora do escopo do teste (que pede só o alerta de meta), o app tem duas funções SQL agendadas via `pg_cron` direto no Supabase, sem depender de nenhum workflow externo:

- **`gerar_notificacoes()`** (`supabase/migrations/20260714000020_gerar_notificacoes.sql`) — cancela automaticamente pedidos parados em `pendente`/`recebido` além do tempo limite da unidade, e notifica atraso (`pedido_atrasado`) quando um pedido em `preparando` estoura o limite.
- **`simular_avaliacoes()`** (`supabase/migrations/20260722000028_simulador_avaliacoes.sql`, notificação em `20260723000030_notificar_avaliacao_ruim.sql`) — pedidos `entregue` há mais de 30s têm 20% de chance de virar avaliação com nota aleatória; nota ≤ 2 notifica o gerente da unidade + gestores gerais.

Agendamento (já aplicado nas migrations, roda sozinho):

```sql
select cron.schedule('gerar_notificacoes', '* * * * *', 'select gerar_notificacoes();');
select cron.schedule('simular_avaliacoes', '* * * * *', 'select simular_avaliacoes();');
```

Isso já estava ativo antes de qualquer workflow n8n dedicado a isso ter sido cogitado — os workflows n8n que existiam pra isso (`gerar-notificacoes.json`, `alerta-avaliacao-ruim.json`) foram removidos do repo porque adicionavam uma dependência externa desnecessária pra algo que o próprio Postgres já resolve sozinho, de forma mais simples e sem custo de infraestrutura extra.

## Credenciais e variáveis (n8n)

Criar após importar (os JSONs referenciam por nome, nunca hardcoded):

| Credencial/variável | Uso |
| --- | --- |
| Credencial Postgres `Supabase Sabor & Cia (Postgres)` | WF1 (host/porta/senha do Supabase → Database Settings; usar o pooler em `Session mode`) |
| Credencial SMTP `SMTP Sabor & Cia` | node de e-mail (qualquer SMTP de teste; Mailtrap serve para a demo) |
| `ANTHROPIC_API_KEY` | WF1 — diagnóstico via Claude |
| `EMAIL_GESTOR` | destinatário dos alertas |
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
Unidade — o gerente aceita (`preparando`) ou recusa (`cancelado`, populando
`log_cancelamentos` via trigger já existente).

**Variáveis de ambiente do n8n** (`Settings → Environments` ou variáveis do
workflow, nunca hardcoded nos nodes):

| Variável                 | Valor                                                       |
| ------------------------ | ----------------------------------------------------------- |
| `SUPABASE_URL`           | mesma de `VITE_SUPABASE_URL` no `.env` do app               |
| `SUPABASE_ANON_KEY`      | mesma de `VITE_SUPABASE_ANON_KEY` (pública, só lê cardápio) |
| `APP_URL`                | URL do deploy (Vercel) ou túnel local (ex. ngrok) em dev    |
| `ORDER_SIMULATOR_SECRET` | mesmo valor configurado no servidor do app                  |

Se a instância do n8n não tiver acesso a variáveis de ambiente (planos sem
`$env.*` liberado), a URL fica hardcoded no node (não é sensível) e o secret
vai numa **Credential do tipo Header Auth**, não em variável — ver os nodes
"Consulta status da rede" / "Envia pedido simulado" no JSON.

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

## Nesta pasta

- `*.json` — workflows exportados do n8n (só os 2 realmente usados)
- Documentação de configuração em produção (variáveis de ambiente, secret do webhook, error workflow, timezone, política de dedupe)
