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
await run("seed_ops.sql", readFileSync(join(dir, "seed_ops.sql"), "utf8"));

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
await q("rpc_tempo_medio_preparo(1)", "select rpc_tempo_medio_preparo(1, 7)");
await q("rpc_itens_mais_vendidos(1)", "select * from rpc_itens_mais_vendidos(1, 5)");
await q(
  "avaliacoes ruins hoje",
  "select nota, comentario from avaliacoes where nota <= 2 and data >= current_date",
);

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
  grant select on all tables in schema public to test_gestor, test_gerente;
  grant update on alertas to test_gestor, test_gerente;
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
console.log("\nTUDO OK — migrations, seed, trigger, RPCs e RLS validados.");
