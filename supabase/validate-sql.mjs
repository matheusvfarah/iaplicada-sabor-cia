// Validação local das migrations + seed com PGlite (Postgres WASM).
// Uso: node .validate-sql.mjs  (requer npm i @electric-sql/pglite)
// Simula o ambiente Supabase com stubs de auth.users / auth.uid().
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

const dir = process.env.SQL_DIR ?? ".";
const db = new PGlite();

const stub = `
  create schema if not exists auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text,
    raw_user_meta_data jsonb default '{}'
  );
  create or replace function auth.uid() returns uuid
    language sql stable as $$ select nullif(current_setting('app.uid', true), '')::uuid $$;
  create role anon nologin;
  create role authenticated nologin;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
`;

async function run(label, sql) {
  try {
    await db.exec(sql);
    console.log("OK  ", label);
  } catch (e) {
    console.error("FAIL", label, "->", e.message);
    process.exit(1);
  }
}

await run("stub auth", stub);
for (const f of readdirSync(join(dir, "migrations")).sort()) {
  await run(f, readFileSync(join(dir, "migrations", f), "utf8"));
}
await run("seed.sql", readFileSync(join(dir, "seed.sql"), "utf8"));

// Smoke tests -------------------------------------------------
const q = async (label, sql) => {
  const r = await db.query(sql);
  console.log("----", label);
  console.table(r.rows);
  return r.rows;
};

const [{ n: pedidos }] = (await db.query("select count(*)::int as n from pedidos")).rows;
console.log("pedidos:", pedidos);
if (pedidos < 2500) {
  console.error("FAIL seed: poucos pedidos");
  process.exit(1);
}

const [{ n: logs }] = (await db.query("select count(*)::int as n from log_cancelamentos")).rows;
console.log("log_cancelamentos:", logs);
if (logs < 1) {
  console.error("FAIL trigger: log vazio");
  process.exit(1);
}

await q(
  "v_alerta_metas",
  "select unidade_nome, meta_receita, receita_acumulada, pct_meta, dias_restantes from v_alerta_metas order by pct_meta",
);
await q("rpc_kpis_unidades", "select * from rpc_kpis_unidades()");
await q("rpc_cancelamento_plataforma", "select * from rpc_cancelamento_plataforma()");
await q("rpc_resumo_mes", "select * from rpc_resumo_mes()");
await q("rpc_pedidos_6m (3 linhas)", "select * from rpc_pedidos_6m() limit 3");
await q("rpc_kpis_unidade(1)", "select * from rpc_kpis_unidade(1)");
await q(
  "rpc_kpis_unidade_periodo(1)",
  "select * from rpc_kpis_unidade_periodo(1, current_date - 6, current_date)",
);
await q(
  "rpc_tempo_medio_preparo(1)",
  "select rpc_tempo_medio_preparo(1, current_date - 6, current_date)",
);
await q(
  "rpc_itens_mais_vendidos(1)",
  "select * from rpc_itens_mais_vendidos(1, current_date - 6, current_date, 5)",
);
await q(
  "avaliacoes ruins hoje",
  "select nota, comentario from avaliacoes where nota <= 2 and data >= current_date",
);
await q(
  "rpc_pedidos_por_plataforma_unidade(1)",
  "select * from rpc_pedidos_por_plataforma_unidade(1, current_date - 180, current_date)",
);
await q(
  "rpc_faturamento_serie_unidade(1)",
  "select * from rpc_faturamento_serie_unidade(1, current_date - 180, current_date)",
);
await q(
  "rpc_avaliacoes_unidade(1) (3 linhas)",
  "select * from rpc_avaliacoes_unidade(1, current_date - 180, current_date) limit 3",
);
const statusRede = await q("rpc_status_rede()", "select * from rpc_status_rede()");
console.log(
  "rpc_status_rede(): só unidades ativas, cardápio é array:",
  statusRede.every((u) => Array.isArray(u.cardapio)),
  "(esperado true)",
);
if (!statusRede.every((u) => Array.isArray(u.cardapio))) {
  console.error("FAIL rpc_status_rede()");
  process.exit(1);
}

// Transições de status do pedido --------------------------------
const [{ id: pedidoTeste }] = (
  await db.query("select id from pedidos where status = 'recebido' limit 1")
).rows;

let transicaoInvalidaFalhou = false;
try {
  await db.query(`update pedidos set status = 'entregue' where id = ${pedidoTeste}`);
} catch {
  transicaoInvalidaFalhou = true;
}
console.log("Transição recebido->entregue bloqueada:", transicaoInvalidaFalhou, "(esperado true)");
if (!transicaoInvalidaFalhou) {
  console.error("FAIL trigger: deveria ter bloqueado transição inválida");
  process.exit(1);
}

await db.query(`update pedidos set status = 'preparando' where id = ${pedidoTeste}`);
const [{ preparando_em }] = (
  await db.query(`select preparando_em from pedidos where id = ${pedidoTeste}`)
).rows;
console.log("preparando_em setado ao entrar em preparando:", !!preparando_em, "(esperado true)");

await db.query(`update pedidos set status = 'entregue' where id = ${pedidoTeste}`);
const [{ entregue_em }] = (
  await db.query(`select entregue_em from pedidos where id = ${pedidoTeste}`)
).rows;
console.log("entregue_em setado ao entrar em entregue:", !!entregue_em, "(esperado true)");

if (!preparando_em || !entregue_em) {
  console.error("FAIL trigger: timestamps de produção não foram setados");
  process.exit(1);
}

// Teste de RLS: cria usuários fake e mede visibilidade ---------
await db.exec(`
  insert into auth.users (id, email, raw_user_meta_data) values
    ('00000000-0000-0000-0000-000000000001', 'gestor@saborecia.com.br',
     '{"nome":"Ana Direção","role":"gestor_geral"}'),
    ('00000000-0000-0000-0000-000000000002', 'gerente.centro@saborecia.com.br',
     '{"nome":"Carlos Lima","role":"gerente","unidade_id":1}');
`);
await db.exec(`
  create role test_gestor login; grant usage on schema public to test_gestor;
  create role test_gerente login; grant usage on schema public to test_gerente;
  grant usage on schema auth to test_gestor, test_gerente;
  grant execute on function auth.uid() to test_gestor, test_gerente;
  grant select on all tables in schema public to test_gestor, test_gerente;
  grant update on alertas to test_gestor, test_gerente;
  grant update (horario_abertura, horario_fechamento) on unidades to test_gestor, test_gerente;
  grant update (status) on unidades to test_gestor, test_gerente;
  grant update (tempo_limite_aceite_min, limite_atraso_min) on unidades to test_gestor, test_gerente;
  grant update (lida, lida_em) on notificacoes to test_gestor, test_gerente;
  grant insert, update, delete on funcionarios to test_gestor, test_gerente;
  grant insert, update on metas to test_gestor, test_gerente;
  grant execute on all functions in schema public to test_gestor, test_gerente;
`);

async function asUser(role, uid, sql) {
  await db.exec(`set role ${role}; set app.uid = '${uid}';`);
  const r = await db.query(sql);
  await db.exec("reset role; reset app.uid;");
  return r.rows;
}

const gestorUnidades = await asUser(
  "test_gestor",
  "00000000-0000-0000-0000-000000000001",
  "select count(*)::int as n from unidades",
);
const gerenteUnidades = await asUser(
  "test_gerente",
  "00000000-0000-0000-0000-000000000002",
  "select count(*)::int as n from unidades",
);
const gerentePedidosOutraUnidade = await asUser(
  "test_gerente",
  "00000000-0000-0000-0000-000000000002",
  "select count(*)::int as n from pedidos where unidade_id <> 1",
);

console.log("RLS gestor vê unidades:", gestorUnidades[0].n, "(esperado 5)");
console.log("RLS gerente vê unidades:", gerenteUnidades[0].n, "(esperado 1)");
console.log(
  "RLS gerente vê pedidos de outras unidades:",
  gerentePedidosOutraUnidade[0].n,
  "(esperado 0)",
);

if (
  gestorUnidades[0].n !== 5 ||
  gerenteUnidades[0].n !== 1 ||
  gerentePedidosOutraUnidade[0].n !== 0
) {
  console.error("FAIL RLS");
  process.exit(1);
}

// rpc_avaliacoes_unidade(): não é security definer — RLS de
// pedidos/avaliacoes já barra gerente pedindo outra unidade.
const gerenteAvaliacoesOutraUnidade = await asUser(
  "test_gerente",
  "00000000-0000-0000-0000-000000000002",
  "select count(*)::int as n from rpc_avaliacoes_unidade(2, current_date - 365, current_date)",
);
console.log(
  "RLS gerente não vê avaliações de outra unidade via RPC:",
  gerenteAvaliacoesOutraUnidade[0].n,
  "(esperado 0)",
);
if (gerenteAvaliacoesOutraUnidade[0].n !== 0) {
  console.error("FAIL RLS rpc_avaliacoes_unidade");
  process.exit(1);
}

// Horário de funcionamento: gerente edita só a própria unidade -----
await db.exec(`set role test_gerente; set app.uid = '00000000-0000-0000-0000-000000000002';`);
const ownUpdate = await db.query(
  `update unidades set horario_abertura = '08:00' where id = 1 returning id`,
);
await db.exec("reset role; reset app.uid;");
console.log(
  "RLS gerente edita horário da própria unidade:",
  ownUpdate.rows.length === 1,
  "(esperado true)",
);

await db.exec(`set role test_gerente; set app.uid = '00000000-0000-0000-0000-000000000002';`);
const otherUpdate = await db.query(
  `update unidades set horario_abertura = '08:00' where id = 2 returning id`,
);
await db.exec("reset role; reset app.uid;");
console.log(
  "RLS gerente NÃO edita horário de outra unidade:",
  otherUpdate.rows.length === 0,
  "(esperado true)",
);

let bloqueouOutraColuna = false;
try {
  await db.exec(`set role test_gerente; set app.uid = '00000000-0000-0000-0000-000000000002';`);
  await db.query(`update unidades set nome = 'Hackeado' where id = 1`);
  await db.exec("reset role; reset app.uid;");
} catch {
  bloqueouOutraColuna = true;
  await db.exec("reset role; reset app.uid;");
}
console.log(
  "RLS gerente NÃO edita nome/status (só horário):",
  bloqueouOutraColuna,
  "(esperado true)",
);

if (ownUpdate.rows.length !== 1 || otherUpdate.rows.length !== 0 || !bloqueouOutraColuna) {
  console.error("FAIL RLS horário de funcionamento");
  process.exit(1);
}

// Ativar/desativar unidade: só gestor_geral --------------------
let gerenteBloqueadoStatus = false;
try {
  await db.exec(`set role test_gerente; set app.uid = '00000000-0000-0000-0000-000000000002';`);
  await db.query(`update unidades set status = 'inativa' where id = 1`);
  await db.exec("reset role; reset app.uid;");
} catch {
  gerenteBloqueadoStatus = true;
  await db.exec("reset role; reset app.uid;");
}
console.log(
  "RLS/trigger gerente NÃO ativa/desativa unidade:",
  gerenteBloqueadoStatus,
  "(esperado true)",
);

let gestorMudaStatus = false;
try {
  await db.exec(`set role test_gestor; set app.uid = '00000000-0000-0000-0000-000000000001';`);
  const r = await db.query(`update unidades set status = 'inativa' where id = 1 returning status`);
  gestorMudaStatus = r.rows.length === 1 && r.rows[0].status === "inativa";
  await db.query(`update unidades set status = 'ativa' where id = 1`);
  await db.exec("reset role; reset app.uid;");
} catch (e) {
  console.error("FAIL: gestor deveria poder ativar/desativar unidade ->", e.message);
}
console.log("RLS gestor ativa/desativa unidade:", gestorMudaStatus, "(esperado true)");

if (!gerenteBloqueadoStatus || !gestorMudaStatus) {
  console.error("FAIL RLS/trigger status da unidade");
  process.exit(1);
}

// Config de pedidos (tempo limite de aceite / meta de preparo) -----
await db.exec(`set role test_gerente; set app.uid = '00000000-0000-0000-0000-000000000002';`);
const configUpdate = await db.query(
  `update unidades set tempo_limite_aceite_min = 7, limite_atraso_min = 25 where id = 1 returning tempo_limite_aceite_min, limite_atraso_min`,
);
await db.exec("reset role; reset app.uid;");
console.log(
  "RLS gerente edita config de pedidos da própria unidade:",
  configUpdate.rows.length === 1 &&
    configUpdate.rows[0].tempo_limite_aceite_min === 7 &&
    configUpdate.rows[0].limite_atraso_min === 25,
  "(esperado true)",
);

if (configUpdate.rows.length !== 1) {
  console.error("FAIL config de pedidos");
  process.exit(1);
}

// Notificações: RLS só enxerga/edita a própria -----------------
// tipo 'vai_abrir' de propósito (não 'vai_fechar') pra não colidir
// com o dedupe (profile_id, unidade_id, tipo, dia) do teste funcional
// de gerar_notificacoes() mais abaixo, que testa 'vai_fechar' na
// mesma unidade 1.
await db.query(`
  insert into notificacoes (profile_id, unidade_id, tipo, titulo, mensagem) values
    ('00000000-0000-0000-0000-000000000001', 1, 'vai_abrir', 'Centro abre em 20 min', 'msg'),
    ('00000000-0000-0000-0000-000000000002', 1, 'pedido_novo', 'Pedido novo', 'msg');
`);

const gerenteNotificacoes = await asUser(
  "test_gerente",
  "00000000-0000-0000-0000-000000000002",
  "select count(*)::int as n from notificacoes",
);
console.log(
  "RLS gerente só vê a própria notificação:",
  gerenteNotificacoes[0].n === 1,
  "(esperado true)",
);

let gerenteBloqueadoOutraNotificacao = false;
try {
  await db.exec(`set role test_gerente; set app.uid = '00000000-0000-0000-0000-000000000002';`);
  await db.query(`update notificacoes set lida = true where profile_id != auth.uid()`);
  await db.exec("reset role; reset app.uid;");
} catch {
  gerenteBloqueadoOutraNotificacao = true;
  await db.exec("reset role; reset app.uid;");
}
// RLS com using() simplesmente não afeta linhas de outro dono (0 rows),
// não lança erro — o que importa é que nada mudou.
const notificacaoDoGestorAindaNaoLida = await db.query(
  `select lida from notificacoes where profile_id = '00000000-0000-0000-0000-000000000001'`,
);
console.log(
  "RLS gerente NÃO marca notificação de outro como lida:",
  notificacaoDoGestorAindaNaoLida.rows[0].lida === false,
  "(esperado true)",
);

const gerenteMarcaPropriaLida = await asUser(
  "test_gerente",
  "00000000-0000-0000-0000-000000000002",
  `update notificacoes set lida = true, lida_em = now() where profile_id = auth.uid() returning lida`,
);
console.log(
  "RLS gerente marca a própria notificação como lida:",
  gerenteMarcaPropriaLida[0]?.lida === true,
  "(esperado true)",
);

if (
  gerenteNotificacoes[0].n !== 1 ||
  notificacaoDoGestorAindaNaoLida.rows[0].lida !== false ||
  gerenteMarcaPropriaLida[0]?.lida !== true
) {
  console.error("FAIL RLS notificações");
  process.exit(1);
}

// gerar_notificacoes(): auto-cancel ------------------------------
// unidade 1 tem gerente (profile 2) + gestor (profile 1) nos fixtures
// de teste — dá pra conferir os dois destinatários de uma vez.
const [{ id: pedidoAutoCancel }] = (
  await db.query(
    `insert into pedidos (unidade_id, valor, plataforma, status, data_pedido)
     values (1, 42.00, 'ifood', 'recebido', now() - interval '2 hours')
     returning id`,
  )
).rows;

await db.query("select gerar_notificacoes()");

const pedidoAposCron = (await db.query(`select status from pedidos where id = ${pedidoAutoCancel}`))
  .rows[0];
console.log(
  "Auto-cancel: pedido recebido antigo vira cancelado:",
  pedidoAposCron.status === "cancelado",
  "(esperado true)",
);

const notifCancelAuto = (
  await db.query(
    `select profile_id from notificacoes where ref_pedido_id = ${pedidoAutoCancel} and tipo = 'pedido_cancelado_auto'`,
  )
).rows;
console.log(
  "Auto-cancel: gerente + gestor notificados:",
  notifCancelAuto.length === 2,
  "(esperado true, veio",
  notifCancelAuto.length + ")",
);

// Dedupe: rodar de novo não duplica a notificação (pedido já não está
// mais 'recebido', então nem entraria no loop de novo, mas o dedupe
// por (profile_id, tipo, ref_pedido_id) é a rede de segurança real).
await db.query("select gerar_notificacoes()");
const notifCancelAutoDepoisDeNovo = (
  await db.query(
    `select id from notificacoes where ref_pedido_id = ${pedidoAutoCancel} and tipo = 'pedido_cancelado_auto'`,
  )
).rows;
console.log(
  "Dedupe: rodar o cron de novo não duplica a notificação:",
  notifCancelAutoDepoisDeNovo.length === 2,
  "(esperado true)",
);

// gerar_notificacoes(): atrasado ----------------------------------
const [{ id: pedidoAtrasado }] = (
  await db.query(
    `insert into pedidos (unidade_id, valor, plataforma, status, data_pedido, preparando_em)
     values (1, 55.00, 'rappi', 'preparando', now() - interval '3 hours', now() - interval '3 hours')
     returning id`,
  )
).rows;

await db.query("select gerar_notificacoes()");

const notifAtrasado = (
  await db.query(
    `select profile_id from notificacoes where ref_pedido_id = ${pedidoAtrasado} and tipo = 'pedido_atrasado'`,
  )
).rows;
console.log(
  "Atrasado: gerente + gestor notificados uma vez:",
  notifAtrasado.length === 2,
  "(esperado true)",
);

await db.query("select gerar_notificacoes()");
const notifAtrasadoDepoisDeNovo = (
  await db.query(
    `select id from notificacoes where ref_pedido_id = ${pedidoAtrasado} and tipo = 'pedido_atrasado'`,
  )
).rows;
console.log(
  "Dedupe: atrasado não duplica rodando o cron de novo:",
  notifAtrasadoDepoisDeNovo.length === 2,
  "(esperado true)",
);

// gerar_notificacoes(): vai abrir / vai fechar ---------------------
// Empurra abertura pra 1h atrás e fechamento pra 20 min à frente —
// garante que a unidade está "aberta" agora (independente da hora
// real em que o teste roda) e cai na janela de 30 min pra fechar.
const janelaFechamento = await db.query(
  `select to_char(now() - interval '1 hour', 'HH24:MI:SS') as abertura,
          to_char(now() + interval '20 minutes', 'HH24:MI:SS') as fechamento`,
);
await db.query(
  `update unidades
   set horario_abertura = '${janelaFechamento.rows[0].abertura}',
       horario_fechamento = '${janelaFechamento.rows[0].fechamento}'
   where id = 1`,
);
await db.query("select gerar_notificacoes()");

const notifVaiFechar = (
  await db.query(`select profile_id from notificacoes where unidade_id = 1 and tipo = 'vai_fechar'`)
).rows;
console.log(
  "Vai fechar: gerente + gestor notificados dentro da janela de 30 min:",
  notifVaiFechar.length === 2,
  "(esperado true)",
);

// calcula_virada_horario(): função pura extraída de gerar_notificacoes()
// (023) — testável com horários fixos, sem depender da hora real em
// que o teste roda.
const virada30min = (
  await db.query(`select * from calcula_virada_horario('11:00', '23:00', '22:30')`)
).rows[0];
console.log(
  "Virada: exatamente 30 min antes de fechar já notifica:",
  virada30min.aberta === true &&
    virada30min.tipo_evento === "vai_fechar" &&
    virada30min.minutos_restantes === 30,
  "(esperado true)",
);

const virada31min = (
  await db.query(`select * from calcula_virada_horario('11:00', '23:00', '22:29')`)
).rows[0];
console.log(
  "Virada: 31 min antes de fechar ainda não notifica:",
  virada31min.minutos_restantes === 31,
  "(esperado true, minutos_restantes = 31)",
);

// Fechamento 23:00→02:00 (Pinheiros): antes da meia-noite, fechando
// em 15 min; e antes de abrir, faltando 15 min pro turno seguinte.
const viradaMadrugadaFechando = (
  await db.query(`select * from calcula_virada_horario('18:00', '02:00', '01:45')`)
).rows[0];
console.log(
  "Virada 18:00→02:00: 01:45 está aberta, fecha em 15 min:",
  viradaMadrugadaFechando.aberta === true &&
    viradaMadrugadaFechando.tipo_evento === "vai_fechar" &&
    viradaMadrugadaFechando.minutos_restantes === 15,
  "(esperado true)",
);

const viradaMadrugadaAbrindo = (
  await db.query(`select * from calcula_virada_horario('18:00', '02:00', '17:45')`)
).rows[0];
console.log(
  "Virada 18:00→02:00: 17:45 está fechada, abre em 15 min:",
  viradaMadrugadaAbrindo.aberta === false &&
    viradaMadrugadaAbrindo.tipo_evento === "vai_abrir" &&
    viradaMadrugadaAbrindo.minutos_restantes === 15,
  "(esperado true)",
);

if (
  !virada30min.aberta ||
  virada30min.minutos_restantes !== 30 ||
  virada31min.minutos_restantes !== 31 ||
  !viradaMadrugadaFechando.aberta ||
  viradaMadrugadaFechando.minutos_restantes !== 15 ||
  viradaMadrugadaAbrindo.aberta ||
  viradaMadrugadaAbrindo.minutos_restantes !== 15
) {
  console.error("FAIL calcula_virada_horario()");
  process.exit(1);
}

// Dedupe diário no fuso de SP: o BUG era usar a data-calendário pura
// (dia_sao_paulo) — pra fechamento que cruza a meia-noite (ex.:
// 23:40–00:10), o trecho antes e depois da virada caem em datas
// diferentes e o índice não colide, gerando duas notificações pro
// MESMO fechamento. dia_operacional_sao_paulo() desloca o corte pra
// 04:00 — os dois lados da meia-noite caem no mesmo "dia operacional".
//
// notificar() sempre grava criado_em = now() (a hora real do teste),
// então pra simular as duas metades cruzando a meia-noite é preciso
// inserir cada linha separada e só DEPOIS mover criado_em pro horário
// simulado via UPDATE — momento em que o índice único é reavaliado e
// deve rejeitar a segunda linha, já que 23:50 de um dia e 00:05 do dia
// seguinte caem no mesmo "dia operacional" (corte às 04:00).
await db.query(`delete from notificacoes where unidade_id = 1 and tipo = 'vai_fechar'`);
await db.query(
  `select notificar(
    '00000000-0000-0000-0000-000000000001', 1, 'vai_fechar', 'Centro vai fechar', 'Centro fecha em 20 min'
  )`,
);
await db.query(
  `update notificacoes set criado_em = '2024-01-15 23:50:00-03'
   where unidade_id = 1 and tipo = 'vai_fechar'`,
);
await db.query(
  `select notificar(
    '00000000-0000-0000-0000-000000000001', 1, 'vai_fechar', 'Centro vai fechar', 'Centro fecha em 5 min'
  )`,
);

let segundaMetadeBloqueada = false;
try {
  await db.query(
    `update notificacoes set criado_em = '2024-01-16 00:05:00-03'
     where unidade_id = 1 and tipo = 'vai_fechar' and mensagem = 'Centro fecha em 5 min'`,
  );
} catch {
  segundaMetadeBloqueada = true;
}
console.log(
  "Dedupe: fechamento que cruza a meia-noite não duplica:",
  segundaMetadeBloqueada,
  "(esperado true)",
);
if (!segundaMetadeBloqueada) {
  console.error("FAIL dedupe vai_fechar cruzando meia-noite");
  process.exit(1);
}

if (
  pedidoAposCron.status !== "cancelado" ||
  notifCancelAuto.length !== 2 ||
  notifCancelAutoDepoisDeNovo.length !== 2 ||
  notifAtrasado.length !== 2 ||
  notifAtrasadoDepoisDeNovo.length !== 2 ||
  notifVaiFechar.length !== 2
) {
  console.error("FAIL gerar_notificacoes()");
  process.exit(1);
}

// Funcionários: CRUD com RLS (gerente só na própria unidade) -----
let gerenteCriaNaPropriaUnidade = false;
let novoFuncionarioId = null;
try {
  await db.exec(`set role test_gerente; set app.uid = '00000000-0000-0000-0000-000000000002';`);
  const r = await db.query(
    `insert into funcionarios (nome, unidade_id, cargo, email)
     values ('Teste RLS', 1, 'Atendente', 'teste.rls@saborecia.com.br')
     returning id`,
  );
  gerenteCriaNaPropriaUnidade = r.rows.length === 1;
  novoFuncionarioId = r.rows[0]?.id ?? null;
  await db.exec("reset role; reset app.uid;");
} catch (e) {
  console.error("FAIL: gerente deveria poder criar funcionário na própria unidade ->", e.message);
}
console.log(
  "Funcionários: gerente cria na própria unidade:",
  gerenteCriaNaPropriaUnidade,
  "(esperado true)",
);

let gerenteBloqueadoOutraUnidade = false;
try {
  await db.exec(`set role test_gerente; set app.uid = '00000000-0000-0000-0000-000000000002';`);
  await db.query(
    `insert into funcionarios (nome, unidade_id, cargo, email)
     values ('Teste RLS 2', 2, 'Atendente', 'teste.rls2@saborecia.com.br')`,
  );
} catch {
  gerenteBloqueadoOutraUnidade = true;
} finally {
  await db.exec("reset role; reset app.uid;");
}
console.log(
  "Funcionários: gerente NÃO cria em outra unidade:",
  gerenteBloqueadoOutraUnidade,
  "(esperado true)",
);

let gerenteBloqueadoReatribuir = false;
if (novoFuncionarioId) {
  try {
    await db.exec(`set role test_gerente; set app.uid = '00000000-0000-0000-0000-000000000002';`);
    await db.query(`update funcionarios set unidade_id = 2 where id = ${novoFuncionarioId}`);
  } catch {
    gerenteBloqueadoReatribuir = true;
  } finally {
    await db.exec("reset role; reset app.uid;");
  }
}
console.log(
  "Funcionários: gerente NÃO reatribui funcionário pra outra unidade:",
  gerenteBloqueadoReatribuir,
  "(esperado true)",
);

let gerenteBloqueadoDeleteOutraUnidade = false;
const [{ id: funcionarioOutraUnidade }] = (
  await db.query(`select id from funcionarios where unidade_id = 2 limit 1`)
).rows;
try {
  await db.exec(`set role test_gerente; set app.uid = '00000000-0000-0000-0000-000000000002';`);
  const r = await db.query(
    `delete from funcionarios where id = ${funcionarioOutraUnidade} returning id`,
  );
  gerenteBloqueadoDeleteOutraUnidade = r.rows.length === 0;
} finally {
  await db.exec("reset role; reset app.uid;");
}
console.log(
  "Funcionários: gerente NÃO apaga funcionário de outra unidade:",
  gerenteBloqueadoDeleteOutraUnidade,
  "(esperado true)",
);

let emailDuplicadoBloqueado = false;
try {
  await db.query(
    `insert into funcionarios (nome, unidade_id, cargo, email)
     values ('Duplicado', 1, 'Atendente', 'teste.rls@saborecia.com.br')`,
  );
} catch {
  emailDuplicadoBloqueado = true;
}
console.log(
  "Funcionários: e-mail duplicado é rejeitado:",
  emailDuplicadoBloqueado,
  "(esperado true)",
);

if (
  !gerenteCriaNaPropriaUnidade ||
  !gerenteBloqueadoOutraUnidade ||
  !gerenteBloqueadoReatribuir ||
  !gerenteBloqueadoDeleteOutraUnidade ||
  !emailDuplicadoBloqueado
) {
  console.error("FAIL RLS funcionarios");
  process.exit(1);
}

// Metas: só gestor_geral edita, e nunca mês passado -------------
let gestorEditaMesAtual = false;
try {
  await db.exec(`set role test_gestor; set app.uid = '00000000-0000-0000-0000-000000000001';`);
  const r = await db.query(
    `insert into metas (unidade_id, mes_referencia, meta_receita, meta_pedidos)
     values (1, date_trunc('month', current_date)::date, 50000, 700)
     on conflict (unidade_id, mes_referencia)
     do update set meta_receita = excluded.meta_receita, meta_pedidos = excluded.meta_pedidos
     returning meta_receita`,
  );
  gestorEditaMesAtual = r.rows.length === 1 && Number(r.rows[0].meta_receita) === 50000;
  await db.exec("reset role; reset app.uid;");
} catch (e) {
  console.error("FAIL: gestor deveria poder editar a meta do mês atual ->", e.message);
}
console.log("Metas: gestor edita meta do mês atual:", gestorEditaMesAtual, "(esperado true)");

let gestorCriaMesFuturo = false;
try {
  await db.exec(`set role test_gestor; set app.uid = '00000000-0000-0000-0000-000000000001';`);
  const r = await db.query(
    `insert into metas (unidade_id, mes_referencia, meta_receita, meta_pedidos)
     values (1, (date_trunc('month', current_date) + interval '1 month')::date, 55000, 720)
     returning id`,
  );
  gestorCriaMesFuturo = r.rows.length === 1;
  await db.exec("reset role; reset app.uid;");
} catch (e) {
  console.error("FAIL: gestor deveria poder criar meta de mês futuro ->", e.message);
}
console.log("Metas: gestor cria meta de mês futuro:", gestorCriaMesFuturo, "(esperado true)");

let gestorBloqueadoMesPassado = false;
try {
  await db.exec(`set role test_gestor; set app.uid = '00000000-0000-0000-0000-000000000001';`);
  await db.query(
    `update metas set meta_receita = 1
     where unidade_id = 1 and mes_referencia = (date_trunc('month', current_date) - interval '1 month')::date`,
  );
} catch {
  gestorBloqueadoMesPassado = true;
} finally {
  await db.exec("reset role; reset app.uid;");
}
console.log("Metas: gestor NÃO edita mês passado:", gestorBloqueadoMesPassado, "(esperado true)");

// Sem exceção: a policy usa USING (não WITH CHECK) pro role, então o
// gerente só filtra 0 linhas em vez de levar erro — testa a contagem.
let gerenteBloqueadoMeta = false;
try {
  await db.exec(`set role test_gerente; set app.uid = '00000000-0000-0000-0000-000000000002';`);
  const r = await db.query(
    `update metas set meta_receita = 1
     where unidade_id = 1 and mes_referencia = date_trunc('month', current_date)::date
     returning id`,
  );
  gerenteBloqueadoMeta = r.rows.length === 0;
} finally {
  await db.exec("reset role; reset app.uid;");
}
console.log(
  "Metas: gerente NÃO edita (só gestor decide meta):",
  gerenteBloqueadoMeta,
  "(esperado true)",
);

if (
  !gestorEditaMesAtual ||
  !gestorCriaMesFuturo ||
  !gestorBloqueadoMesPassado ||
  !gerenteBloqueadoMeta
) {
  console.error("FAIL RLS metas");
  process.exit(1);
}

console.log("\nTUDO OK — migrations, seed, trigger, RPCs e RLS validados.");
