-- ============================================================
-- Sabor & Cia — 024 Metas do mês editáveis (Rodada 5, item 4)
--
-- metas só tinha policy de select (002) — só gestor_geral edita
-- (decisão de rede, não da unidade — gerente só visualiza). "Mês
-- passado é read-only" vira parte do próprio with check em vez de
-- constraint de tabela: um check constraint bloquearia também o
-- seed (insere 5 meses históricos pra trás pros gráficos) já que
-- constraints valem pra qualquer role, RLS não vale pro service_role
-- que roda o seed.
-- ============================================================

create policy metas_insert on metas for insert
  with check (
    get_my_role() = 'gestor_geral'
    and mes_referencia >= date_trunc('month', current_date)::date
  );

create policy metas_update on metas for update
  using (get_my_role() = 'gestor_geral')
  with check (
    get_my_role() = 'gestor_geral'
    and mes_referencia >= date_trunc('month', current_date)::date
  );
