-- ============================================================
-- Sabor & Cia — 031 RPCs pro alerta de meta via n8n sem Postgres
--
-- O workflow WF1 (alerta-meta-diaria) antes conectava direto no
-- Postgres via credential do n8n. Reescrito pra não tocar no banco
-- por lá: o n8n só faz HTTP GET/POST na própria API do app (que já
-- roda com service_role no servidor), igual ao padrão do simulador
-- de pedidos (/api/status, /api/pedidos/simular). Essas duas RPCs
-- security definer são a camada que os novos handlers HTTP chamam.
--
-- rpc_metas_em_risco(): mesma query que já existia embutida no JSON
-- do workflow — unidades com pct_meta < 0.6 e dias_restantes <= 10,
-- excluindo quem já tem alerta 'meta' criado neste mês (dedupe).
--
-- rpc_registrar_alerta_meta(): idempotente — se rodar de novo pra
-- mesma unidade no mesmo mês, não duplica (retorna null em vez de
-- inserir), então não depende do n8n rodar exatamente uma vez.
-- ============================================================

create or replace function rpc_metas_em_risco()
returns table (
  unidade_id bigint,
  unidade_nome text,
  meta_receita numeric,
  receita_acumulada numeric,
  pct_meta numeric,
  dias_restantes int
)
language sql
stable
security definer
set search_path = public
as $$
  select
    v.unidade_id,
    v.unidade_nome,
    v.meta_receita,
    v.receita_acumulada,
    round(v.pct_meta * 100, 1) as pct_meta,
    v.dias_restantes
  from v_alerta_metas v
  where v.pct_meta < 0.6
    and v.dias_restantes <= 10
    and not exists (
      select 1 from alertas a
      where a.unidade_id = v.unidade_id
        and a.tipo = 'meta'
        and a.criado_em >= date_trunc('month', now() at time zone 'America/Sao_Paulo')
    );
$$;

create or replace function rpc_registrar_alerta_meta(
  p_unidade_id bigint,
  p_mensagem text,
  p_payload jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
begin
  if exists (
    select 1 from alertas
    where unidade_id = p_unidade_id
      and tipo = 'meta'
      and criado_em >= date_trunc('month', now() at time zone 'America/Sao_Paulo')
  ) then
    return null;
  end if;

  insert into alertas (unidade_id, tipo, mensagem, payload)
  values (p_unidade_id, 'meta', p_mensagem, p_payload)
  returning id into v_id;

  return v_id;
end;
$$;
