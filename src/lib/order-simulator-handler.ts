// Server-only. Recebe o POST do workflow n8n WF3 (simulador de
// pedidos) e insere o pedido via RPC atômica, usando a
// service_role key — nunca chamado nem importado pelo cliente.
import { z } from "zod";
import { getSupabaseAdmin } from "./supabase-admin";

const payloadSchema = z.object({
  unidade_id: z.number().int().positive(),
  plataforma: z.enum(["ifood", "rappi", "proprio"]),
  itens: z
    .array(
      z.object({
        produto_id: z.number().int().positive(),
        quantidade: z.number().int().positive(),
      }),
    )
    .min(1)
    .max(10),
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function handleSimularPedido(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return json({ error: "method not allowed" }, 405);
  }

  const expectedSecret = process.env.ORDER_SIMULATOR_SECRET;
  if (!expectedSecret) {
    return json({ error: "ORDER_SIMULATOR_SECRET não configurado no servidor" }, 500);
  }

  const receivedSecret = request.headers.get("x-webhook-secret");
  if (receivedSecret !== expectedSecret) {
    return json({ error: "unauthorized" }, 401);
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return json({ error: "invalid json body" }, 400);
  }

  const parsed = payloadSchema.safeParse(rawBody);
  if (!parsed.success) {
    return json({ error: "invalid payload", issues: parsed.error.issues }, 400);
  }

  const { unidade_id, plataforma, itens } = parsed.data;

  const { data, error } = await getSupabaseAdmin().rpc("rpc_inserir_pedido_simulado", {
    p_unidade_id: unidade_id,
    p_plataforma: plataforma,
    p_itens: itens,
  });

  if (error) {
    return json({ error: error.message }, 400);
  }

  return json({ id: data }, 201);
}
