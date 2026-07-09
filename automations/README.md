# Automações (n8n Cloud)

_Em construção — ver `docs/01-spec-design-sabor-cia.md` seção 3 para o desenho completo._

## Workflows planejados

| Workflow                | Gatilho                                   | Descrição                                                                                           |
| ----------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `alerta-meta-diaria`    | Schedule (08:00 America/Sao_Paulo)        | Consulta `v_alerta_metas`, gera diagnóstico via Claude API e insere em `alertas` + e-mail ao gestor |
| `alerta-avaliacao-ruim` | Webhook (Supabase Database Webhook)       | Nota ≤ 2 dispara alerta ao gerente da unidade                                                       |
| `simulador-pedidos`     | Schedule (curto, com sorteio de execução) | Simula pedidos novos chegando — ver desenho abaixo (adicional, fora do requisito original)          |

### `simulador-pedidos` — adicional (fora do escopo original)

Decisão consciente de expandir o escopo além do exigido: em vez de só o badge
de alertas, os pedidos "chegam" simulados por um cron do n8n, aparecem como
popup de aceite/recusa pro gerente (com os itens e disponibilidade atual do
cardápio), fechando um loop de operação mais realista.

Workflow pronto pra importar em **[`simulador-pedidos.json`](./simulador-pedidos.json)**
(`Workflows → Import from File` no n8n). 5 nodes:

1. **Schedule Trigger** — a cada 2 min. n8n não tem "intervalo aleatório"
   nativo sem um loop de Wait, então a aleatoriedade fica no node seguinte.
2. **Code — "Sorteia disparo e unidade"** — ~40% de chance de realmente virar
   um pedido nessa execução (senão retorna `[]` e a cadeia para ali, sem
   pedidos vazios); sorteia uma unidade ativa (`[1,2,3,4]` — Centro,
   Pinheiros, Moema, Santana) e a plataforma (`ifood`/`rappi`/`proprio`).
3. **HTTP Request — "Busca cardápio disponível"** — `POST` na RPC pública
   `rpc_cardapio_disponivel` (nova, migration `20260709000014`) com a `anon
key`. Sem isso o gerador ficaria cego sobre preços/disponibilidade e teria
   que adivinhar `produto_id`, quebrando toda vez que um item fosse pausado
   no Cardápio — RLS normal de `produtos` exige usuário autenticado, então
   essa RPC é `security definer`, expondo só `produto_id`/`nome`/`preco` dos
   itens com `disponivel = true` da unidade pedida (equivalente a qualquer
   cardápio público de verdade, nada sensível).
4. **Code — "Monta itens do pedido"** — do cardápio retornado, sorteia 1 a 4
   itens distintos e quantidades (1–3 cada), montando o payload final.
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
