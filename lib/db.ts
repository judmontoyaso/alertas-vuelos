import { createClient } from "@supabase/supabase-js";

export const SCHEMA = "vuelo";
export const TABLE = "flight_alerts";
export const HISTORY_TABLE = "price_history";

function create(url: string, key: string) {
  return createClient(url, key, { db: { schema: SCHEMA }, auth: { persistSession: false } });
}

let client: ReturnType<typeof create> | null = null;

// Cliente de servidor con la clave secreta: nunca importar desde componentes de cliente.
export function getDb() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  client ??= create(url, key);
  return client;
}
