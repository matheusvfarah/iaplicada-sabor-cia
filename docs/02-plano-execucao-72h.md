# Plano de execução — 72h

Marcos com folga embutida: o Dia 3 termina com ~6h de buffer antes do envio.

## Dia 1 — Fundação (banco + auth)

- [ ] **H0–H1** Pesquisar IAplicada (site, LinkedIn) e enviar 1–2 perguntas de escopo à Mariana (ex.: "o alerta compara com meta cheia do mês ou pró-rata?") — perguntar é avaliado positivamente
- [ ] **H1–H2** Criar projeto Supabase + repo GitHub `sabor-cia-dashboard` (público) + primeiro commit com estrutura de pastas
- [ ] **H2–5** Migrations: 8 tabelas, funções `get_my_role()`/`get_my_unidade()`, policies RLS, trigger `on_pedido_cancelado`, RPCs de agregação, view `v_alerta_metas`
- [ ] **H5–7** Seed: gerar `seed.sql` (Claude Code) com os casos de demonstração; validar KPIs com queries manuais
- [ ] **H7–8** Criar os 2 usuários de teste (gestor geral + gerente) e validar RLS com cada um no SQL editor
- [ ] **H8–10** Scaffold no Lovable: conectar Supabase, tela de login, layout base com identidade visual, sync GitHub
- [ ] Commit checkpoint: "banco completo + auth funcionando"

## Dia 2 — Dashboards (50% da nota está aqui)

- [ ] **H0–4** Dashboard Geral: gauge meta, gráfico 6 meses, ticket médio, cancelamento por plataforma, ranking
- [ ] **H4–6** Dashboard Unidade: pedidos do dia, meta, nota média, top 5
- [ ] **H6–7** Filtro de período + redirect por role + guard de rotas
- [ ] **H7–9** Refinamento no Claude Code: responsivo, dark mode, loading/empty states, polish visual
- [ ] **H9–10** Realtime: pedidos ao vivo no dashboard da unidade + badge de alertas
- [ ] Deploy preliminar na Vercel (pega problema de env cedo)
- [ ] Commit checkpoint: "dashboards completos com dados reais"

## Dia 3 — Automação + entrega

- [ ] **H0–2** WF1 `alerta-meta-diaria`: schedule → view → dedupe → Claude API → insert `alertas` → e-mail; testar com execução manual
- [ ] **H2–3.5** WF2 `alerta-avaliacao-ruim`: Database Webhook → IF nota ≤ 2 → insert + e-mail; testar inserindo avaliação ruim e vendo o badge aparecer ao vivo
- [ ] **H3.5–4.5** Exportar JSONs, screenshots, escrever `automations/README.md`
- [ ] **H4.5–5.5** Export CSV/PDF dos relatórios (diferencial restante)
- [ ] **H5.5–7** README principal: descrição, stack, justificativas, credenciais, trade-offs, "o que faria diferente"
- [ ] **H7–8** Teste ponta a ponta em janela anônima com as duas credenciais, mobile incluído; revisar histórico de commits
- [ ] **Buffer ~6h**
- [ ] Enviar e-mail à Mariana: link repo + link deploy + credenciais

## Regras de corte (se o tempo apertar)

1. Corta export PDF (mantém CSV)
2. Corta dark mode
3. Corta WF2 (WF1 é o requisito)
4. **Nunca corta:** RLS funcionando, seed, os dois dashboards, README honesto — "transparência conta mais do que perfeição"

## Riscos conhecidos

| Risco                              | Mitigação                                                                 |
| ---------------------------------- | ------------------------------------------------------------------------- |
| Lovable gerar RLS/queries erradas  | Banco é feito antes, à mão via migrations; Lovable só consome             |
| Recursão de policy RLS em profiles | Funções security definer desde o início                                   |
| Trial do n8n Cloud expirar/limitar | Testar login no n8n no Dia 1                                              |
| Realtime não disparar              | Habilitar replication nas tabelas `pedidos` e `alertas` logo na migration |
| Env vars na Vercel                 | Deploy preliminar no Dia 2                                                |
