import { NextResponse } from "next/server";
import { requireAccess } from "@/lib/auth";
import { checkAlerts } from "@/lib/check";
import { getDb, TABLE } from "@/lib/db";
import type { Alert } from "@/lib/types";

export const maxDuration = 60;

type Context = { params: Promise<{ id: string }> };

const noDb = () => NextResponse.json({ error: "Falta configurar Supabase." }, { status: 503 });

// Pausar o reanudar.
export async function PATCH(request: Request, { params }: Context) {
  const denied = requireAccess(request);
  if (denied) return denied;
  const db = getDb();
  if (!db) return noDb();

  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (typeof body?.active !== "boolean") {
    return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
  }
  const { data, error } = await db
    .from(TABLE)
    .update({ active: body.active })
    .eq("id", id)
    .select()
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "La alerta ya no existe." }, { status: 404 });
  return NextResponse.json({ alert: data });
}

export async function DELETE(request: Request, { params }: Context) {
  const denied = requireAccess(request);
  if (denied) return denied;
  const db = getDb();
  if (!db) return noDb();

  const { id } = await params;
  const { error } = await db.from(TABLE).delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

// Consultar el precio ahora (gasta una busqueda de SerpApi).
export async function POST(request: Request, { params }: Context) {
  const denied = requireAccess(request);
  if (denied) return denied;
  const db = getDb();
  if (!db) return noDb();

  const { id } = await params;
  const { data: alert } = await db.from(TABLE).select("*").eq("id", id).maybeSingle();
  if (!alert) return NextResponse.json({ error: "La alerta ya no existe." }, { status: 404 });

  try {
    const [result] = await checkAlerts([alert as Alert]);
    const { data } = await db.from(TABLE).select("*").eq("id", id).single();
    return NextResponse.json({ alert: data, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error interno";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
