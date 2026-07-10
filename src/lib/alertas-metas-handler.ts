// Server-only. GET/POST do workflow n8n WF1 (alerta de meta diária) —
// o n8n não conecta no Postgres: consulta quais unidades estão em
// risco por aqui e registra o alerta por aqui, sempre com a
// service_role. Nunca chamado nem importado pelo cliente.
import { z } from "zod";
import { getSupabaseAdmin } from "./supabase-admin";

const registrarSchema = z.object({
  unidade_id: z.number().int().positive(),
  mensagem: z.string().min(1),
  payload: z.record(z.string(), z.unknown()).optional(),
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function checkSecret(request: Request): Response | null {
  const expectedSecret = process.env.METAS_ALERT_SECRET;
  if (!expectedSecret) {
    return json({ error: "METAS_ALERT_SECRET não configurado no servidor" }, 500);
  }
  const receivedSecret = request.headers.get("x-webhook-secret");
  if (receivedSecret !== expectedSecret) {
    return json({ error: "unauthorized" }, 401);
  }
  return null;
}

export async function handleMetasEmRisco(request: Request): Promise<Response> {
  if (request.method !== "GET") {
    return json({ error: "method not allowed" }, 405);
  }

  const authError = checkSecret(request);
  if (authError) return authError;

  const { data, error } = await getSupabaseAdmin().rpc("rpc_metas_em_risco");

  if (error) {
    return json({ error: error.message }, 400);
  }

  return json({ unidades: data }, 200);
}

export async function handleRegistrarAlertaMeta(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return json({ error: "method not allowed" }, 405);
  }

  const authError = checkSecret(request);
  if (authError) return authError;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return json({ error: "invalid json body" }, 400);
  }

  const parsed = registrarSchema.safeParse(rawBody);
  if (!parsed.success) {
    return json({ error: "invalid payload", issues: parsed.error.issues }, 400);
  }

  const { unidade_id, mensagem, payload } = parsed.data;

  const { data, error } = await getSupabaseAdmin().rpc("rpc_registrar_alerta_meta", {
    p_unidade_id: unidade_id,
    p_mensagem: mensagem,
    p_payload: payload ?? {},
  });

  if (error) {
    return json({ error: error.message }, 400);
  }

  if (data === null) {
    return json({ id: null, ja_registrado: true }, 200);
  }

  return json({ id: data }, 201);
}
