import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const TABLE = "flight_alerts";

let client: SupabaseClient | null = null;

// Cliente de servidor con la clave secreta: nunca importar desde componentes de cliente.
export function getDb(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  client ??= createClient(url, key, { auth: { persistSession: false } });
  return client;
}
