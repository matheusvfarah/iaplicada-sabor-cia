-- ============================================================
-- Sabor & Cia — 025 Status da rede pro workflow n8n (GET /status)
--
-- O WF3 (simulador de pedidos) precisa decidir ANTES de montar o
-- payload do POST /api/pedidos/simular: quais unidades estão abertas
-- agora e o que cada uma tem disponível no cardápio. Reaproveita
-- calcula_virada_horario() (023, já usada por gerar_notificacoes())
-- pro cálculo de aberta/fechada — mesma lógica, uma fonte só de
-- verdade — e o mesmo filtro de disponível=true de
-- rpc_cardapio_disponivel (014). security definer + grant pra anon
-- porque n8n chama sem sessão de usuário, mesmo padrão das duas.
-- ============================================================

create or replace function rpc_status_rede()
returns table (
  unidade_id bigint,
  nome text,
  aberta boolean,
  horario_abertura time,
  horario_fechamento time,
  cardapio jsonb
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  return query
  select
    u.id,
    u.nome,
    v.aberta,
    u.horario_abertura,
    u.horario_fechamento,
    (
      select coalesce(jsonb_agg(jsonb_build_object('produto_id', p.id, 'nome', p.nome, 'preco', p.preco)), '[]'::jsonb)
      from produtos p
      where p.unidade_id = u.id and p.disponivel = true
    ) as cardapio
  from unidades u
  cross join lateral calcula_virada_horario(u.horario_abertura, u.horario_fechamento, now()::time) v
  where u.status = 'ativa';
end;
$$;

revoke all on function rpc_status_rede() from public;
grant execute on function rpc_status_rede() to anon, authenticated;
