# Automações (n8n Cloud)

_Em construção — ver `docs/01-spec-design-sabor-cia.md` seção 3 para o desenho completo._

## Workflows planejados

| Workflow | Gatilho | Descrição |
|---|---|---|
| `alerta-meta-diaria` | Schedule (08:00 America/Sao_Paulo) | Consulta `v_alerta_metas`, gera diagnóstico via Claude API e insere em `alertas` + e-mail ao gestor |
| `alerta-avaliacao-ruim` | Webhook (Supabase Database Webhook) | Nota ≤ 2 dispara alerta ao gerente da unidade |

## Nesta pasta (quando concluído)

- `*.json` — workflows exportados do n8n
- Screenshots dos workflows
- Documentação de configuração em produção (variáveis de ambiente, secret do webhook, error workflow, timezone, política de dedupe)
