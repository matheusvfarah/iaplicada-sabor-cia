# Sabor & Cia — Painel Operacional

> Teste técnico Dev No-Code — IAplicada. Dashboard para gestão de uma rede de dark kitchens: performance de unidades, pedidos, receita, metas e alertas automatizados.

**Deploy:** _[link em breve]_

## Credenciais de teste

| Perfil | E-mail | Senha |
|---|---|---|
| Gestor Geral | _[a definir]_ | _[a definir]_ |
| Gerente de Unidade | _[a definir]_ | _[a definir]_ |

## Stack e justificativa

| Camada | Ferramenta | Por quê |
|---|---|---|
| Frontend | Lovable + Claude Code (refinamento) | Velocidade de scaffold + controle fino do código via GitHub sync |
| Backend | Supabase (Auth, Postgres, RLS, Realtime) | Auth pronto, RLS nativo, realtime sem infra extra |
| Automação | n8n Cloud | Workflows visuais, exportáveis e auditáveis |
| Deploy | Vercel | CI a partir do GitHub |
| IA | Claude (Cowork + Code) | Modelagem, geração de SQL/seed e diagnóstico nos alertas |

## Estrutura

```
supabase/
  migrations/      # schema, RLS, triggers, RPCs, view
  seed.sql         # dados de demonstração (~13k pedidos, 6 meses, 5 unidades)
  validate-sql.mjs # teste automatizado: roda migrations + seed num Postgres
                   # local (PGlite) e valida RLS, trigger e RPCs
automations/    # workflows n8n exportados (JSON) + documentação
docs/           # spec de design e plano de execução
```

## Decisões técnicas e trade-offs

_[em construção — ver docs/01-spec-design-sabor-cia.md]_

## Automação

_[screenshots e descrição dos workflows — ver automations/README.md]_

## O que faria diferente com mais tempo

_[a preencher no fim]_
