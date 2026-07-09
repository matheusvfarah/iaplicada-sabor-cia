// Server-only. NUNCA importar deste arquivo em componentes/rotas de
// cliente — usa a service_role key, que ignora RLS e não pode vazar
// no bundle do navegador.
import { createClient } from "@supabase/supabase-js";

export function getSupabaseAdmin() {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("VITE_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias no servidor.");
  }

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
