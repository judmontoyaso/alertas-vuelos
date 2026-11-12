import { NextResponse } from "next/server";
import { labelFor } from "@/lib/airports";
import { requireAccess } from "@/lib/auth";
import { getDb, TABLE } from "@/lib/db";
import { channels, sendConfirmation } from "@/lib/notify";
import { validateSearch } from "@/lib/search";
import type { Alert } from "@/lib/types";

// Tope para no agotar los creditos de SerpApi: cada alerta activa gasta busquedas a diario.
const MAX_ACTIVE_ALERTS = 30;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

  // Sin precio tope la alerta es automatica: avisa cuando el precio baja del rango habitual.
  const hasTarget = body.target_price !== undefined && body.target_price !== null && body.target_price !== "";
  const target_price = hasTarget ? Number(body.target_price) : null;
  const email = String(body.email ?? "").trim() || null;
  const telegram_chat_id = String(body.telegram_chat_id ?? "").trim() || null;
  const typical = Array.isArray(body.typical) ? body.typical.map(Number) : [];

  const problem =
    target_price !== null && (!Number.isFinite(target_price) || target_price <= 0)
      ? "El precio tope debe ser mayor que cero."
      : !email && !telegram_chat_id
        ? "Indica un correo o un chat de Telegram para avisarte."
        : email && !EMAIL.test(email)
          ? "El correo no es válido."
          : telegram_chat_id && !/^-?\d+$/.test(telegram_chat_id)
            ? "El chat ID de Telegram es un número."
            : null;
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

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

  // Si el formulario ya consulto precios, se guarda el rango habitual para no repetir la busqueda.
  const knownTypical = typical.length === 2 && typical.every((n: number) => Number.isFinite(n) && n > 0);
  const { data, error } = await db
    .from(TABLE)
    .insert({
      ...validated.search,
      origin_label: labelFor(validated.search.origin),
      destination_label: labelFor(validated.search.destination),
      target_price,
      email,
      telegram_chat_id,
      ...(knownTypical
        ? { typical_low: typical[0], typical_high: typical[1], insights_at: new Date().toISOString() }
        : {}),
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const confirmation_sent = await sendConfirmation(data as Alert);
  return NextResponse.json({ alert: data, confirmation_sent }, { status: 201 });
}
