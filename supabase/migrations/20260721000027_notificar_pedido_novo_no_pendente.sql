-- ============================================================
-- Sabor & Cia — 027 Notificação de pedido novo junto com o popup
--
-- 026 fez notificar_pedido_novo() disparar em 'preparando' (aceite),
-- não em 'pendente' (nascimento do pedido). Resultado: o popup de
-- aceite/recusa aparecia na hora, mas o toast/sino de "Pedido novo"
-- só chegava DEPOIS que o gerente clicava em Aceitar — dois eventos
-- do mesmo pedido, separados no tempo, quando deveriam ser um só.
--
-- Ajuste: passa a disparar no INSERT com status = 'pendente' (mesmo
-- gatilho que abre o popup no client, via canal Realtime filtrado
-- por esse status em src/routes/unidade.$unidadeId.tsx). O índice
-- uniq_notificacao_pedido (profile_id, tipo, ref_pedido_id) já
-- garante que não duplica notificação pro mesmo pedido.
-- ============================================================

create or replace function notificar_pedido_novo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  dest record;
begin
  if new.status = 'pendente' and (tg_op = 'INSERT' or old.status is distinct from 'pendente') then
    -- só os gerentes da unidade — o gestor acompanha pelo badge da
    -- sidebar, não pelo sino (ver Fase 3).
    for dest in
      select pr.id as profile_id
      from profiles pr
      where pr.role = 'gerente' and pr.unidade_id = new.unidade_id
    loop
      perform notificar(
        dest.profile_id,
        new.unidade_id,
        'pedido_novo',
        'Pedido novo',
        format('Pedido %s chegou — %s', new.codigo, new.plataforma::text),
        new.id
      );
    end loop;
  end if;
  return new;
end;
$$;
