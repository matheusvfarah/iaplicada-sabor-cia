-- ============================================================
-- Sabor & Cia — 028 Simulador de avaliações
--
-- Em vez de um novo workflow n8n, a geração de avaliações fica no
-- banco, no mesmo padrão de gerar_notificacoes() (020): um cron de
-- 1 em 1 minuto varre pedidos entregues há mais de 30s que ainda não
-- foram "sorteados", e decide com 20% de chance se aquele pedido
-- vira uma avaliação com nota aleatória (1-5). Nota <= 2 gera alerta
-- pro gestor, reaproveitando o mesmo efeito que o workflow
-- alerta-avaliacao-ruim.json (WF2) já produzia via webhook — insert
-- em `alertas` tipo 'avaliacao'. Como a função já insere o alerta
-- diretamente, NÃO configure o Database Webhook do WF2 pra
-- `avaliacoes` (senão a mesma avaliação ruim gera 2 alertas).
--
-- `avaliacao_sorteada` marca que o pedido já passou pelo sorteio
-- (deu avaliação ou não), pra não re-rolar a cada minuto e inflar a
-- chance real acima de 20%. Pedidos já entregues antes desta
-- migration são marcados como já sorteados, pra não virarem uma
-- rajada de avaliações retroativas no primeiro cron.
-- ============================================================

alter table pedidos add column if not exists avaliacao_sorteada boolean not null default false;

update pedidos set avaliacao_sorteada = true where status = 'entregue';

create or replace function simular_avaliacoes()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_nota smallint;
begin
  for r in
    select p.id, p.unidade_id, p.valor, p.plataforma, u.nome as unidade_nome
    from pedidos p
    join unidades u on u.id = p.unidade_id
    where p.status = 'entregue'
      and p.avaliacao_sorteada = false
      and p.entregue_em <= now() - interval '30 seconds'
  loop
    update pedidos set avaliacao_sorteada = true where id = r.id;

    if random() < 0.2 then
      v_nota := (1 + floor(random() * 5))::smallint;

      insert into avaliacoes (pedido_id, nota)
      values (r.id, v_nota)
      on conflict (pedido_id) do nothing;

      if v_nota <= 2 then
        insert into alertas (unidade_id, tipo, mensagem, payload)
        values (
          r.unidade_id,
          'avaliacao',
          format(
            'Avaliação nota %s na unidade %s (pedido de R$ %s via %s)',
            v_nota, r.unidade_nome, r.valor, r.plataforma::text
          ),
          jsonb_build_object('nota', v_nota, 'pedido_id', r.id, 'plataforma', r.plataforma, 'valor', r.valor)
        );
      end if;
    end if;
  end loop;
end;
$$;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    if not exists (select 1 from cron.job where jobname = 'simular_avaliacoes') then
      perform cron.schedule('simular_avaliacoes', '* * * * *', 'select simular_avaliacoes();');
    end if;
  end if;
end $$;
