-- ============================================================
-- Sabor & Cia — Seed de demonstração
-- 5 unidades (cardápio próprio, nichado, por unidade) · ~13.000
-- pedidos em 6 meses com sazonalidade, cada um com itens reais em
-- pedido_itens e valor = soma desses itens (não um número solto) ·
-- preparando_em/entregue_em nascem com o pedido, sem backfill ·
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

-- Cardápio (rede toda de cozinha italiana) ------------------------
-- Alimenta o simulador de pedidos e o kanban: cada pedido sorteia
-- itens do catálogo da PRÓPRIA unidade, respeitando disponível. 1-2
-- itens pausados por unidade para demonstrar a tela de Cardápio.
-- Cada unidade tem uma especialidade dentro do conceito italiano.
--
-- Centro    -> pizzaria (fornos a lenha, giro rápido)
-- Pinheiros -> massas artesanais
-- Moema     -> risotos
-- Santana   -> cantina executiva (ticket mais baixo)
insert into produtos (unidade_id, nome, preco, categoria, descricao, disponivel)
select u.id, p.nome, p.preco, p.categoria, p.descricao, p.disponivel
from unidades u
join lateral (
  values
    -- Centro (id 1) — Pizzaria -----------------------------------
    (1, 'Pizza Margherita',        42.90, 'pratos',     'Molho de tomate, muçarela de búfala e manjericão', true),
    (1, 'Pizza Calabresa',         39.90, 'pratos',     'Calabresa fatiada, cebola e azeitonas',            true),
    (1, 'Pizza Quatro Queijos',    44.90, 'pratos',     'Muçarela, gorgonzola, parmesão e provolone',       true),
    (1, 'Pizza Vegetariana',       38.90, 'pratos',     'Abobrinha, berinjela, pimentão e rúcula',          false),
    (1, 'Bruschetta',              19.90, 'pratos',     'Pão italiano tostado, tomate e manjericão fresco', true),
    (1, 'Refrigerante Lata',        6.50, 'bebidas',    'Lata 350ml',                                       true),
    (1, 'Suco Natural 300ml',       8.90, 'bebidas',    'Polpa de fruta natural, sem açúcar adicionado',    true),
    (1, 'Água com Gás 500ml',       6.90, 'bebidas',    'Gelada',                                            true),
    (1, 'Tiramisù',                16.90, 'sobremesas', 'Camadas de café, mascarpone e cacau',              true),
    (1, 'Cannoli Siciliano',       14.90, 'sobremesas', 'Massa crocante recheada com ricota doce',          false),
    -- Pinheiros (id 2) — Massas Artesanais ------------------------
    (2, 'Fettuccine Alfredo',      36.90, 'pratos',     'Massa fresca, molho de queijo e manteiga',         true),
    (2, 'Spaghetti alla Bolognese',34.90, 'pratos',     'Massa fresca, ragu de carne lento',                 true),
    (2, 'Ravioli de Ricota',       38.90, 'pratos',     'Recheado de ricota e espinafre, molho de sálvia',  true),
    (2, 'Penne all''Arrabbiata',   29.90, 'pratos',     'Molho de tomate picante, alho e pimenta',          true),
    (2, 'Lasanha à Bolonhesa',     37.90, 'pratos',     'Camadas de massa, ragu e molho branco',             false),
    (2, 'Suco Detox Verde',        12.90, 'bebidas',    'Couve, gengibre, limão e maçã verde',              true),
    (2, 'Água com Gás 500ml',       6.90, 'bebidas',    'Gelada',                                            true),
    (2, 'Chá Gelado Natural',       9.90, 'bebidas',    'Chá verde com hortelã, sem açúcar',                true),
    (2, 'Panna Cotta',             14.90, 'sobremesas', 'Creme italiano com calda de frutas vermelhas',     true),
    (2, 'Tiramisù',                16.90, 'sobremesas', 'Camadas de café, mascarpone e cacau',              true),
    -- Moema (id 3) — Risotos ----------------------------------------
    (3, 'Risoto de Funghi',        42.90, 'pratos',     'Cogumelos frescos, vinho branco e parmesão',       true),
    (3, 'Risoto de Camarão',       46.90, 'pratos',     'Camarões salteados e toque de limão siciliano',    true),
    (3, 'Risoto à Milanesa',       38.90, 'pratos',     'Açafrão, vinho branco e parmesão',                 true),
    (3, 'Risoto de Alho-poró',     36.90, 'pratos',     'Alho-poró, manteiga e queijo grana padano',        true),
    (3, 'Carpaccio',               32.90, 'pratos',     'Fatias finas de carne, alcaparras e parmesão',     false),
    (3, 'Refrigerante Lata',        6.50, 'bebidas',    'Lata 350ml',                                       true),
    (3, 'Suco de Manga',            9.90, 'bebidas',    'Polpa natural de manga',                           true),
    (3, 'Água com Gás 500ml',       6.90, 'bebidas',    'Gelada',                                            true),
    (3, 'Tiramisù',                16.90, 'sobremesas', 'Camadas de café, mascarpone e cacau',              true),
    (3, 'Panna Cotta',             14.90, 'sobremesas', 'Creme italiano com calda de frutas vermelhas',     true),
    -- Santana (id 4) — Cantina Executiva (ticket mais baixo) -------
    (4, 'Marmita de Spaghetti',    21.90, 'pratos',     'Spaghetti ao molho de tomate e carne moída',       true),
    (4, 'Marmita de Nhoque',       23.90, 'pratos',     'Nhoque de batata ao molho sugo',                   true),
    (4, 'Prato Executivo Lasanha', 24.90, 'pratos',     'Lasanha à bolonhesa com salada',                   true),
    (4, 'Prato Executivo Penne',   21.90, 'pratos',     'Penne ao molho branco com frango',                 true),
    (4, 'Sopa de Legumes',         16.90, 'pratos',     'Sopa caseira com legumes da estação',              false),
    (4, 'Refrigerante Lata',        6.50, 'bebidas',    'Lata 350ml',                                       true),
    (4, 'Suco Natural 300ml',       7.90, 'bebidas',    'Polpa de fruta natural, sem açúcar adicionado',    true),
    (4, 'Água Mineral 500ml',       4.50, 'bebidas',    'Sem gás',                                          true),
    (4, 'Pudim de Leite',           9.90, 'sobremesas', 'Pudim de leite condensado tradicional',            true),
    (4, 'Cannoli Siciliano',       12.90, 'sobremesas', 'Massa crocante recheada com ricota doce',          true)
) as p(unidade_id, nome, preco, categoria, descricao, disponivel) on p.unidade_id = u.id
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

-- Pedidos (~4.000 em 180 dias), itens e tempos embutidos ----------
-- Volume: base por unidade × fator fim de semana (1.4) × ruído
-- Santana cai para 45% do volume no mês corrente (caso do alerta)
--
-- valor é sempre a soma real de pedido_itens (nunca um número solto)
-- e preparando_em/entregue_em nascem junto com o pedido — sem
-- backfill posterior. Cada pedido sorteia 1-4 itens distintos do
-- cardápio da PRÓPRIA unidade, respeitando o que está disponível.
with cfg (uid, base) as (
  values (1, 22), (2, 18), (3, 15), (4, 12)
),
dias as (
  select d::date as dia
  from generate_series(current_date - 179, current_date, interval '1 day') d
),
volume as (
  select c.uid, d.dia,
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
  select v.uid, v.dia,
         random() as r_plat, random() as r_status,
         random() as r_turno, random() as r_hora,
         random() as r_prep_start, random() as r_prep_dur
  from volume v cross join lateral generate_series(1, v.n)
),
linhas_status as (
  select uid, dia, r_turno, r_hora, r_prep_start, r_prep_dur,
    case when r_plat < 0.90 then 'ifood'
         when r_plat < 0.95 then 'rappi'
         else 'proprio' end::plataforma_pedido as plataforma,
    case
      when dia < current_date then
        case when r_plat < 0.90 and r_status < 0.11 then 'cancelado'
             when r_plat >= 0.90 and r_plat < 0.95 and r_status < 0.08 then 'cancelado'
             when r_plat >= 0.95 and r_status < 0.05 then 'cancelado'
             else 'entregue' end
      else -- pedidos de hoje: operação em andamento
        case when r_status < 0.25 then 'recebido'
             when r_status < 0.50 then 'preparando'
             else 'entregue' end
    end::status_pedido as status
  from linhas
),
linhas_tempos as (
  select uid, plataforma, status,
    case
      when dia < current_date then
        -- picos de almoço (11h-14h) e jantar (18h-22h)
        dia::timestamptz
          + case when r_turno < 0.40
                 then make_interval(hours => 11, mins => (r_hora * 180)::int)
                 else make_interval(hours => 18, mins => (r_hora * 240)::int) end
      else least(now() - make_interval(mins => (r_hora * 360)::int), now())
    end as data_pedido,
    r_prep_start, r_prep_dur
  from linhas_status
),
linhas_finais as (
  select uid, plataforma, status, data_pedido,
    case when status in ('preparando', 'entregue')
      then data_pedido + make_interval(mins => (5 + r_prep_start * 10)::int)
      else null end as preparando_em,
    r_prep_dur
  from linhas_tempos
),
novos_pedidos as (
  insert into pedidos (unidade_id, valor, plataforma, status, data_pedido, preparando_em, entregue_em)
  select
    -- valor é só um placeholder (constraint exige > 0) — a query
    -- final desta CTE substitui pela soma real de pedido_itens.
    uid, 0.01, plataforma, status, data_pedido, preparando_em,
    case when status = 'entregue'
      then preparando_em + make_interval(mins => (15 + r_prep_dur * 20)::int)
      else null end
  from linhas_finais
  returning id, unidade_id
),
-- n_itens por pedido, decidido uma vez só (não pode nascer dentro
-- do join de baixo, senão cada linha do produto sortearia seu
-- próprio n e o "limit" pararia de fazer sentido).
pedidos_com_n as (
  select id as pedido_id, unidade_id, (1 + floor(random() * 4))::int as n_itens
  from novos_pedidos
),
-- Junta cada pedido com TODO o cardápio disponível da própria
-- unidade e numera aleatoriamente dentro de cada pedido — evita de
-- vez o padrão "LATERAL + order by random() limit N" correlacionado
-- por unidade_id, que o planner do Postgres pode cachear/reusar
-- entre pedidos da MESMA unidade (Memoize), fazendo vários pedidos
-- saírem com exatamente os mesmos itens.
itens_candidatos as (
  select pc.pedido_id, pc.n_itens, pr.id as produto_id, pr.preco,
         row_number() over (partition by pc.pedido_id order by random()) as rn
  from pedidos_com_n pc
  join produtos pr on pr.unidade_id = pc.unidade_id and pr.disponivel = true
),
itens_gerados as (
  insert into pedido_itens (pedido_id, produto_id, quantidade, preco_unitario)
  select pedido_id, produto_id, (1 + floor(random() * 3))::int, preco
  from itens_candidatos
  where rn <= n_itens
  returning pedido_id, quantidade, preco_unitario
)
select count(*) from itens_gerados;

-- Statement à parte de propósito: um UPDATE dentro do mesmo WITH
-- do INSERT usa o snapshot do início do comando e não enxerga as
-- linhas que o próprio INSERT acabou de criar (ficaria tudo com o
-- placeholder 0.01) — só funciona como uma instrução nova, lendo
-- pedido_itens já commitado pela instrução anterior.
update pedidos p
set valor = sub.total
from (
  select pedido_id, sum(quantidade * preco_unitario) as total
  from pedido_itens
  group by pedido_id
) sub
where p.id = sub.pedido_id;

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
