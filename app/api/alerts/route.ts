import { NextResponse } from "next/server";
import { requireAccess } from "@/lib/auth";
import { getDb, TABLE } from "@/lib/db";
import { channels } from "@/lib/notify";
import { CURRENCIES, type Currency } from "@/lib/types";


// Tope para no agotar los creditos de SerpApi: cada alerta activa gasta una busqueda diaria.
const MAX_ACTIVE_ALERTS = 30;

const IATA = /^[A-Z]{3}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
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
  const origin = String(body.origin ?? "").trim().toUpperCase();
  const destination = String(body.destination ?? "").trim().toUpperCase();
  const outbound_date = String(body.outbound_date ?? "");
  const return_date = body.return_date ? String(body.return_date) : null;
  const currency = String(body.currency ?? "COP") as Currency;
  const target_price = Number(body.target_price);
  const email = String(body.email ?? "").trim() || null;
  const telegram_chat_id = String(body.telegram_chat_id ?? "").trim() || null;
  const today = new Date().toISOString().slice(0, 10);

  const problem =
    !IATA.test(origin) || !IATA.test(destination)
      ? "Origen y destino son códigos de aeropuerto de 3 letras, como MDE o MAD."
      : origin === destination
        ? "El destino debe ser distinto del origen."
        : !DATE.test(outbound_date) || outbound_date < today
          ? "La fecha de salida debe ser hoy o posterior."
          : return_date && (!DATE.test(return_date) || return_date < outbound_date)
            ? "La fecha de regreso no puede ser anterior a la de salida."
            : !CURRENCIES.includes(currency)
              ? "Moneda no admitida."
              : !Number.isFinite(target_price) || target_price <= 0
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

  const { data, error } = await db
    .from(TABLE)
    .insert({
      origin,
      destination,
      outbound_date,
      return_date,
      currency,
      target_price,
      email,
      telegram_chat_id,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ alert: data }, { status: 201 });
}
