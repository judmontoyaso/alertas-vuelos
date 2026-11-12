import { NextResponse } from "next/server";
import { labelFor } from "@/lib/airports";
import { requireAccess } from "@/lib/auth";
import { getDb, TABLE } from "@/lib/db";
import { channels, sendConfirmation } from "@/lib/notify";
import { typicalFields, validateDelivery, validateSearch } from "@/lib/search";
import type { Alert } from "@/lib/types";

// Tope para no agotar los creditos de SerpApi: cada alerta activa gasta busquedas a diario.
const MAX_ACTIVE_ALERTS = 30;

const noDb = () =>
  NextResponse.json(
    { error: "Falta configurar SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en Vercel." },
    { status: 503 },
  );

export async function GET(request: Request) {
  const denied = requireAccess(request);
  if (denied) return denied;
  const db = getDb();
  if (!db) return noDb();

  const { data, error } = await db
    .from(TABLE)
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    alerts: data,
    config: {
      flights: Boolean(process.env.SERPAPI_KEY),
      email: channels.email(),
      telegram: channels.telegram(),
    },
  });
}

export async function POST(request: Request) {
  const denied = requireAccess(request);
  if (denied) return denied;
  const db = getDb();
  if (!db) return noDb();

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
  }
  const validated = validateSearch(body);
  if ("error" in validated) return NextResponse.json({ error: validated.error }, { status: 400 });

  const delivery = validateDelivery(body);
  if ("error" in delivery) return NextResponse.json({ error: delivery.error }, { status: 400 });

  const { count } = await db
    .from(TABLE)
    .select("id", { count: "exact", head: true })
    .eq("active", true);
  if ((count ?? 0) >= MAX_ACTIVE_ALERTS) {
    return NextResponse.json(
      { error: `Ya hay ${MAX_ACTIVE_ALERTS} alertas activas. Pausa o elimina alguna.` },
      { status: 409 },
    );
  }

  const { data, error } = await db
    .from(TABLE)
    .insert({
      ...validated.search,
      origin_label: labelFor(validated.search.origin),
      destination_label: labelFor(validated.search.destination),
      ...delivery.delivery,
      // Si el formulario ya consulto precios, se guarda el rango habitual para no repetir la busqueda.
      ...typicalFields(body),
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const confirmation_sent = await sendConfirmation(data as Alert);
  return NextResponse.json({ alert: data, confirmation_sent }, { status: 201 });
}
