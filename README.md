# Sabor & Cia — Painel Operacional

> Teste técnico Dev No-Code — IAplicada. Dashboard para gestão de uma rede de dark kitchens: performance de unidades, pedidos, receita, metas e alertas automatizados.

**Deploy:** _[link em breve]_

## Credenciais de teste

| Perfil             | E-mail                          | Senha          |
| ------------------ | ------------------------------- | -------------- |
| Gestor Geral       | gestor@saborecia.com.br         | x9K7qkB6GgwQXw |
| Gerente de Unidade | gerente.centro@saborecia.com.br | lVaZMjXfDJR33E |

## Stack e justificativa

| Camada    | Ferramenta                               | Por quê                                                          |
| --------- | ---------------------------------------- | ---------------------------------------------------------------- |
| Frontend  | Lovable + Claude Code (refinamento)      | Velocidade de scaffold + controle fino do código via GitHub sync |
| Backend   | Supabase (Auth, Postgres, RLS, Realtime) | Auth pronto, RLS nativo, realtime sem infra extra                |
| Automação | n8n Cloud                                | Workflows visuais, exportáveis e auditáveis                      |
| Deploy    | Vercel                                   | CI a partir do GitHub                                            |
| IA        | Claude (Cowork + Code)                   | Modelagem, geração de SQL/seed e diagnóstico nos alertas         |

## Estrutura

```
src/, public/       # Frontend — gerado/sincronizado via Lovable (GitHub sync)
                     # componentes, rotas, telas (login, dashboards)

supabase/           # Backend — banco de dados como código
  migrations/        # schema, RLS, triggers, RPCs, view
  seed.sql           # dados de demonstração (~13k pedidos, 6 meses, 5 unidades)
  validate-sql.mjs   # teste automatizado: roda migrations + seed num Postgres
                     # local (PGlite) e valida RLS, trigger e RPCs

automations/        # Automação — workflows n8n exportados (JSON) + documentação

docs/               # Spec de design e plano de execução
```

## Decisões técnicas e trade-offs

_[em construção — ver docs/01-spec-design-sabor-cia.md]_

## Automação

_[screenshots e descrição dos workflows — ver automations/README.md]_

## O que faria diferente com mais tempo

_[a preencher no fim]_
