-- ============================================================
-- Sabor & Cia — 030 Notificação (push) de avaliação ruim
--
-- 028 fez simular_avaliacoes() inserir em `alertas` quando a nota é
-- <= 2, reaproveitando a tabela que já existia desde o schema
-- inicial (`alertas`, alimentada por WF1/WF2). Só que `alertas` é
-- puramente pull: só existe uma tela (/rede/alertas, gestor-only,
-- src/routes/rede.alertas.tsx) sem provider global, sem toast, sem
-- som, sem badge — bem diferente de `notificacoes`, que tem
-- NotificacoesProvider montado no shell raiz (src/components/
-- app-shell.tsx) e dispara toast/som pra qualquer tela em que o
-- usuário esteja. Resultado: a avaliação ruim gerava a linha em
-- `alertas` certinho, mas ninguém era avisado — nem o gerente (que
-- nem tem acesso à rota /rede/alertas) nem o gestor, a menos que
-- estivesse com a aba de Alertas aberta no exato momento do INSERT.
--
-- Ajuste: mantém o insert em `alertas` (histórico da tela de
-- Alertas) e ADICIONA um insert em `notificacoes`, tipo
-- 'avaliacao_ruim' (criado em 029), pros mesmos destinatários de
-- sempre — gerente da unidade + todos os gestor_geral
-- (destinatarios_unidade(), criada em 020) — reaproveitando o mesmo
-- caminho de push (toast/som/sino) que pedido_novo/pedido_atrasado
-- já usam.
-- ============================================================

create unique index if not exists uniq_notificacao_avaliacao
  on notificacoes (profile_id, tipo, ref_pedido_id)
  where tipo = 'avaliacao_ruim';

create or replace function simular_avaliacoes()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_nota smallint;
  dest record;
begin
  for r in
    select p.id, p.unidade_id, p.valor, p.plataforma, p.codigo, u.nome as unidade_nome
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

        for dest in select * from destinatarios_unidade(r.unidade_id) loop
          perform notificar(
            dest.profile_id,
            r.unidade_id,
            'avaliacao_ruim',
            'Avaliação ruim recebida',
            format('Pedido %s recebeu nota %s', r.codigo, v_nota),
            r.id
          );
        end loop;
      end if;
    end if;
  end loop;
end;
$$;
