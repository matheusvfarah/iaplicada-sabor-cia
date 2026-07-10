# Automações (n8n Cloud)

Dois workflows exportados como JSON (`Workflows → Import from File` no n8n). Nenhum dos dois usa variáveis de ambiente do n8n (`$env.*`) nem conecta direto no Postgres — o plano do n8n usado aqui não libera acesso a env vars, então todo segredo é uma **Credential** (Header Auth/SMTP) e todo acesso a dado é um **HTTP Request na própria API do app**, nunca um node Postgres.

| Workflow                                                | Gatilho                                   | Descrição                                                                                                                   |
| -------------------------------------------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------- |
| [`alerta-meta-diaria.json`](./alerta-meta-diaria.json) | Schedule (08:00 America/Sao_Paulo)        | **Requisito do teste.** GET na API do app pra saber quais unidades estão em risco, registra o alerta via POST na API e manda e-mail (fictício) ao gestor |
| [`simulador-pedidos.json`](./simulador-pedidos.json)   | Schedule (curto, com sorteio de execução) | Simula pedidos chegando pela mesma API que um integrador real usaria (adicional, fora do requisito)                        |

Avaliação ruim, atraso de pedido e cancelamento automático **não dependem de n8n** — rodam direto no banco via `pg_cron` (ver seção "Cron no banco" abaixo). Não há workflow n8n pra eles.

## WF1 — `alerta-meta-diaria`

Fluxo: **Schedule 08:00** → **HTTP GET** `/api/alertas/metas-em-risco` (retorna as unidades com `pct_meta < 0.6` e `dias_restantes <= 10`, já sem quem recebeu alerta esse mês — dedupe embutido na consulta) → **Code**: explode a lista em 1 item por unidade e monta a mensagem do alerta a partir dos KPIs (texto fixo, sem IA) → **HTTP POST** `/api/alertas/metas` (registra o alerta; idempotente — se já tiver alerta da mesma unidade nesse mês, não duplica, só devolve `ja_registrado: true`) → **IF**: só segue se o registro foi novo → **E-mail fictício** ao gestor.

O n8n nunca toca o Postgres: as duas rotas HTTP (`GET /api/alertas/metas-em-risco`, `POST /api/alertas/metas`) rodam no servidor do app com a `service_role` key (`src/lib/alertas-metas-handler.ts`), igual ao padrão já usado pelo simulador de pedidos (`/api/status`, `/api/pedidos/simular`). A tabela `alertas` no banco continua sendo o destino final (aparece no painel `/rede/alertas` do gestor), só que quem escreve nela é o app, não o n8n.

Racional: o requisito pede "envie um alerta" — entregamos exatamente isso, sem complexidade extra: uma mensagem factual montada a partir dos KPIs da unidade, sem chamada a LLM nem custo/latência de API externa. O e-mail é fictício (endereço de teste hardcoded no node) — trocar pelo endereço real do gestor em produção.

**Demo:** o seed deixa a unidade Santana abaixo de 60% da meta. Como o gatilho de dias (`dias_restantes <= 10`) pode não bater no dia da avaliação, ajuste temporariamente o filtro em `rpc_metas_em_risco()` (`supabase/migrations/20260724000031_rpc_alertas_metas.sql`) para `dias_restantes <= 31` e rode o workflow manualmente (`Execute Workflow`), ou aguarde a janela real do mês.

### Endpoints usados pelo WF1

**`GET /api/alertas/metas-em-risco`** — header `x-webhook-secret: <METAS_ALERT_SECRET>`. Chama a RPC `rpc_metas_em_risco()` e devolve:

```json
{
  "unidades": [
    {
      "unidade_id": 3,
      "unidade_nome": "Santana",
      "meta_receita": 50000,
      "receita_acumulada": 18000,
      "pct_meta": 36.0,
      "dias_restantes": 7
    }
  ]
}
```

**`POST /api/alertas/metas`** — mesmo header, corpo `{ "unidade_id": 3, "mensagem": "...", "payload": {...} }`. Chama `rpc_registrar_alerta_meta()`, que já faz o dedupe (não exists alerta tipo `meta` da mesma unidade nesse mês) antes de inserir. Respostas: `201 { "id": 42 }` quando registra; `200 { "id": null, "ja_registrado": true }` quando já existia (idempotente — pode rodar o workflow mais de uma vez no mesmo dia sem duplicar alerta nem e-mail).

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

## Credenciais (n8n)

Criar após importar (os JSONs referenciam por nome, nunca hardcoded, e nenhum secret fica salvo no JSON exportado):

| Credencial | Tipo | Uso |
| --- | --- | --- |
| `Metas Alert Secret` | Header Auth (`x-webhook-secret: <METAS_ALERT_SECRET>`) | WF1 — GET e POST na API de alertas de meta |
| `SMTP Sabor & Cia` | SMTP | WF1 — e-mail fictício ao gestor (qualquer SMTP de teste; Mailtrap serve pra demo) |
| `Sabor e Cia` (Header Auth, `x-webhook-secret: <ORDER_SIMULATOR_SECRET>`) | Header Auth | WF3 — ver seção do simulador |

`METAS_ALERT_SECRET` é uma variável de ambiente **do app** (Vercel), não do n8n — configurada em `.env`/`.env.example` e lida por `src/lib/alertas-metas-handler.ts` no servidor. O n8n só guarda o mesmo valor dentro da Credential, nunca como env var.

## Produção (como eu configuraria de verdade)

- **Credenciais** sempre em Credentials do n8n — os JSONs do repo não contêm nenhum secret.
- **Error workflow** global: capturar falha de qualquer node → notificar canal de ops; HTTP nodes com retry (2x, backoff) para instabilidade de rede.
- **Dedupe** no banco (SQL, via `rpc_registrar_alerta_meta`), não em memória do n8n — sobrevive a restart e a execuções concorrentes, e deixa o workflow seguro pra rodar mais de uma vez sem duplicar alerta/e-mail.
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
   servidor do app, autenticado via Credential Header Auth `Sabor e Cia`
   (`x-webhook-secret`). O integrador NUNCA toca o banco: o servidor
   responde quais unidades estão ativas, **abertas agora** (pelo horário de
   funcionamento) e o cardápio disponível de cada uma (respeitando itens
   pausados) — exatamente como uma vitrine pública.
4. **Code — "Monta pedido pela vitrine"** — filtra unidades abertas com
   cardápio, sorteia a unidade, 1 a 4 itens distintos e quantidades (1–3).
   Rede fechada ⇒ nenhum pedido nasce fora do horário.
5. **HTTP Request — "Envia pedido simulado"** — `POST` em
   `/api/pedidos/simular` (URL hardcoded no node — não é sensível), mesma
   Credential Header Auth do passo 3.

O endpoint (implementado em `src/server.ts` /
`src/lib/order-simulator-handler.ts`) valida o secret, calcula o valor a
partir do preço atual do cardápio (nunca confia no payload) e insere o
pedido com status `pendente` via RPC atômica (`rpc_inserir_pedido_simulado`).
O pedido aparece **ao vivo** (Supabase Realtime) como popup no Dashboard da
Unidade — o gerente aceita (`preparando`) ou recusa (`cancelado`, populando
`log_cancelamentos` via trigger já existente).

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
pro escopo do teste. A mesma decisão vale pros endpoints de alerta de meta
(`/api/alertas/metas-em-risco`, `/api/alertas/metas`).

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
- Documentação de configuração em produção (Credentials, error workflow, timezone, política de dedupe)
