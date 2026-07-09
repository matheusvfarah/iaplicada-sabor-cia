-- ============================================================
-- Sabor & Cia — Seed de demonstração
-- 5 unidades · ~13.000 pedidos em 6 meses com sazonalidade ·
-- metas · funcionários · ~4.500 avaliações
--
-- Idempotente: limpa e regenera tudo. Datas são relativas a
-- current_date, então a demo sempre mostra "os últimos 6 meses".
--
-- Casos de demonstração embutidos:
--   · Unidade Santana (id 4) com volume ~45% do normal no mês
--     corrente -> aciona o alerta de meta (workflow n8n 1)
--   · Avaliações nota <= 2 recentes -> material p/ workflow n8n 2
--   · Pedidos cancelados -> log_cancelamentos populado via trigger
--
-- USUÁRIOS DE TESTE (criar no dashboard: Authentication > Add user,
-- com "Auto Confirm User" e o user_metadata abaixo — o trigger
-- handle_new_user cria o profile automaticamente):
--   gestor@saborecia.com.br  -> {"nome":"Ana Direção","role":"gestor_geral"}
--   gerente.centro@saborecia.com.br -> {"nome":"Carlos Lima","role":"gerente","unidade_id":1}
-- ============================================================

begin;

truncate pedido_itens, produtos, log_cancelamentos, alertas, avaliacoes, pedidos,
         metas, funcionarios, unidades restart identity cascade;

select setseed(0.42);

-- Unidades ------------------------------------------------------
insert into unidades (nome, endereco, status, data_abertura) values
  ('Centro',    'Rua Barão de Itapetininga, 140 - Centro, São Paulo/SP', 'ativa',   current_date - interval '3 years'),
  ('Pinheiros', 'Rua dos Pinheiros, 870 - Pinheiros, São Paulo/SP',      'ativa',   current_date - interval '2 years'),
  ('Moema',     'Av. Ibirapuera, 2033 - Moema, São Paulo/SP',            'ativa',   current_date - interval '18 months'),
  ('Santana',   'Rua Voluntários da Pátria, 1550 - Santana, São Paulo/SP','ativa',  current_date - interval '1 year'),
  ('Tatuapé',   'Rua Tuiuti, 2100 - Tatuapé, São Paulo/SP',              'inativa', current_date - interval '2 years');

-- Funcionários --------------------------------------------------
insert into funcionarios (nome, unidade_id, cargo, email) values
  ('Carlos Lima',      1, 'Gerente',   'carlos.lima@saborecia.com.br'),
  ('Juliana Prado',    1, 'Cozinheiro','juliana.prado@saborecia.com.br'),
  ('Rafael Souza',     1, 'Cozinheiro','rafael.souza@saborecia.com.br'),
  ('Beatriz Nunes',    1, 'Auxiliar',  'beatriz.nunes@saborecia.com.br'),
  ('Fernanda Alves',   2, 'Gerente',   'fernanda.alves@saborecia.com.br'),
  ('Diego Martins',    2, 'Cozinheiro','diego.martins@saborecia.com.br'),
  ('Larissa Campos',   2, 'Auxiliar',  'larissa.campos@saborecia.com.br'),
  ('Tiago Ferreira',   3, 'Gerente',   'tiago.ferreira@saborecia.com.br'),
  ('Camila Rocha',     3, 'Cozinheiro','camila.rocha@saborecia.com.br'),
  ('Bruno Teixeira',   3, 'Auxiliar',  'bruno.teixeira@saborecia.com.br'),
  ('Patrícia Gomes',   4, 'Gerente',   'patricia.gomes@saborecia.com.br'),
  ('Lucas Barbosa',    4, 'Cozinheiro','lucas.barbosa@saborecia.com.br'),
  ('Aline Cardoso',    4, 'Auxiliar',  'aline.cardoso@saborecia.com.br'),
  ('Marcos Vieira',    5, 'Gerente',   'marcos.vieira@saborecia.com.br');

-- Cardápio (mesmo menu-base em cada unidade ativa) ---------------
-- Alimenta o simulador de pedidos: cada pedido simulado sorteia
-- itens deste catálogo, respeitando a disponibilidade.
insert into produtos (unidade_id, nome, preco, disponivel)
select u.id, p.nome, p.preco, true
from unidades u
cross join (values
  ('Marmita Fit Frango',        24.90),
  ('Marmita Fit Carne',         26.90),
  ('Bowl Vegetariano',          22.50),
  ('Combo Burger Artesanal',    32.90),
  ('Yakisoba Tradicional',      28.00),
  ('Salada Caesar com Frango',  21.90),
  ('Refrigerante Lata',          6.50),
  ('Suco Natural 300ml',         8.90),
  ('Sobremesa Brownie',          9.90)
) as p(nome, preco)
where u.status = 'ativa';

-- Metas (6 meses × 4 unidades ativas) ---------------------------
insert into metas (unidade_id, mes_referencia, meta_receita, meta_pedidos)
select u.id,
       (date_trunc('month', current_date) - (m || ' months')::interval)::date,
       case u.id when 1 then 46000 when 2 then 45000 when 3 then 29000 else 21000 end,
       case u.id when 1 then 640   when 2 then 520   when 3 then 440   else 350   end
from unidades u
cross join generate_series(0, 5) m
where u.status = 'ativa';

-- Pedidos (~4.000 em 180 dias) ----------------------------------
-- Volume: base por unidade × fator fim de semana (1.4) × ruído
-- Santana cai para 45% do volume no mês corrente (caso do alerta)
with cfg (uid, base, ticket) as (
  values (1, 22, 72.0), (2, 18, 85.0), (3, 15, 65.0), (4, 12, 58.0)
),
dias as (
  select d::date as dia
  from generate_series(current_date - 179, current_date, interval '1 day') d
),
volume as (
  select c.uid, c.ticket, d.dia,
    greatest(1, round(
      c.base
      * case when extract(isodow from d.dia) in (6, 7) then 1.4 else 1.0 end
      * (0.7 + random() * 0.6)
      * case when c.uid = 4 and d.dia >= date_trunc('month', current_date)::date
             then 0.45 else 1.0 end
    ))::int as n
  from cfg c cross join dias d
),
linhas as (
  select v.uid, v.ticket, v.dia,
         random() as r_plat, random() as r_status, random() as r_valor,
         random() as r_turno, random() as r_hora
  from volume v cross join lateral generate_series(1, v.n)
)
insert into pedidos (unidade_id, valor, plataforma, status, data_pedido)
select
  uid,
  round((ticket * (0.55 + r_valor * 0.9))::numeric, 2),
  case when r_plat < 0.50 then 'ifood'
       when r_plat < 0.75 then 'rappi'
       else 'proprio' end::plataforma_pedido,
  case
    when dia < current_date then
      case when r_plat < 0.50 and r_status < 0.11 then 'cancelado'
           when r_plat >= 0.50 and r_plat < 0.75 and r_status < 0.08 then 'cancelado'
           when r_plat >= 0.75 and r_status < 0.05 then 'cancelado'
           else 'entregue' end
    else -- pedidos de hoje: operação em andamento
      case when r_status < 0.25 then 'recebido'
           when r_status < 0.50 then 'preparando'
           else 'entregue' end
  end::status_pedido,
  case
    when dia < current_date then
      -- picos de almoço (11h-14h) e jantar (18h-22h)
      dia::timestamptz
        + case when r_turno < 0.40
               then make_interval(hours => 11, mins => (r_hora * 180)::int)
               else make_interval(hours => 18, mins => (r_hora * 240)::int) end
    else least(now() - make_interval(mins => (r_hora * 360)::int), now())
  end
from linhas;

-- Avaliações (~35% dos pedidos entregues) ------------------------
with candidatos as (
  select p.id, p.data_pedido,
         random() as r_sel, random() as r_nota,
         random() as r_com, random() as r_delay
  from pedidos p
  where p.status = 'entregue'
)
insert into avaliacoes (pedido_id, nota, comentario, data)
select
  id,
  case when r_nota < 0.45 then 5
       when r_nota < 0.75 then 4
       when r_nota < 0.87 then 3
       when r_nota < 0.95 then 2
       else 1 end,
  case
    when r_com > 0.60 then null
    when r_nota < 0.75 then
      (array['Comida excelente, chegou quentinha!',
             'Muito bom, virou favorito aqui em casa.',
             'Entrega rápida e embalagem caprichada.',
             'Sabor ótimo, porção generosa.'])[1 + floor(random() * 4)::int]
    when r_nota < 0.87 then
      (array['Ok, mas já foi melhor.',
             'Comida boa, entrega demorou um pouco.',
             'Na média. Nada de especial.'])[1 + floor(random() * 3)::int]
    else
      (array['Chegou frio e a embalagem estava violada.',
             'Demorou mais de 1h30, comida ressecada.',
             'Veio pedido errado e ninguém respondeu no chat.',
             'Porção muito menor que na foto. Decepcionado.'])[1 + floor(random() * 4)::int]
  end,
  least(data_pedido + make_interval(hours => 1 + (r_delay * 20)::int), now())
from candidatos
where r_sel < 0.35;

-- Garante 2 avaliações ruins de hoje (demo do workflow 2) --------
insert into avaliacoes (pedido_id, nota, comentario, data)
select p.id, 1, 'Pedido chegou completamente frio, experiência péssima.', now() - interval '30 minutes'
from pedidos p
where p.status = 'entregue'
  and p.data_pedido >= current_date
  and not exists (select 1 from avaliacoes a where a.pedido_id = p.id)
limit 1;

insert into avaliacoes (pedido_id, nota, comentario, data)
select p.id, 2, 'Faltou um item e a embalagem vazou na sacola.', now() - interval '10 minutes'
from pedidos p
where p.status = 'entregue'
  and p.data_pedido >= current_date
  and not exists (select 1 from avaliacoes a where a.pedido_id = p.id)
limit 1;

-- Recria profiles para usuários auth.users já existentes ---------
-- truncate ... cascade em unidades também limpa `profiles` (FK).
-- Isso reidrata os profiles a partir do user_metadata, igual o
-- trigger handle_new_user faria num signup novo — mantém o seed
-- idempotente sem derrubar os usuários de teste já criados.
insert into profiles (id, nome, role, unidade_id)
select
  id,
  coalesce(raw_user_meta_data ->> 'nome', email),
  coalesce((raw_user_meta_data ->> 'role')::user_role, 'gerente'),
  nullif(raw_user_meta_data ->> 'unidade_id', '')::bigint
from auth.users
on conflict (id) do update set
  nome       = excluded.nome,
  role       = excluded.role,
  unidade_id = excluded.unidade_id;

commit;

-- Verificação rápida (rodar à mão) -------------------------------
-- select count(*) as pedidos, min(data_pedido)::date, max(data_pedido)::date from pedidos;
-- select * from v_alerta_metas order by pct_meta;
-- select count(*) from log_cancelamentos;  -- deve ser > 0 (trigger)
-- select * from rpc_kpis_unidades();
