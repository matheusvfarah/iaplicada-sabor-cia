// Server-only. GET do workflow n8n WF3 (simulador de pedidos) — antes
// de decidir unidade/itens/quantidade/plataforma pro POST em
// /api/pedidos/simular, o workflow consulta aqui quais unidades estão
// abertas agora e o que cada uma tem disponível no cardápio. Nunca
// chamado nem importado pelo cliente.
import { getSupabaseAdmin } from "./supabase-admin";

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function handleStatusRede(request: Request): Promise<Response> {
  if (request.method !== "GET") {
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

  const { data, error } = await getSupabaseAdmin().rpc("rpc_status_rede");

  if (error) {
    return json({ error: error.message }, 400);
  }

  return json({ unidades: data }, 200);
}
