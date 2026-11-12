import { NextResponse } from "next/server";
import { requireAccess } from "@/lib/auth";
import { checkAlerts } from "@/lib/check";
import { labelFor } from "@/lib/airports";
import { getDb, HISTORY_TABLE, TABLE } from "@/lib/db";
import { typicalFields, validateDelivery, validateSearch } from "@/lib/search";
import type { Alert, Search } from "@/lib/types";

export const maxDuration = 60;

type Context = { params: Promise<{ id: string }> };

const noDb = () => NextResponse.json({ error: "Falta configurar Supabase." }, { status: 503 });

const SEARCH_KEYS = [
  "mode", "origin", "destination", "round_trip", "out_from", "out_to", "ret_from", "ret_to",
  "month", "trip_length", "currency",
] as const satisfies readonly (keyof Search)[];

// Cambios de una edicion completa. Si cambia la busqueda (ruta, fechas o moneda), lo que se
// sabia de precios ya no aplica y se borra; si solo cambia el tope, se puede volver a avisar.
function editFields(existing: Alert, body: Record<string, unknown>) {
  const validated = validateSearch(body, existing.out_from);
  if ("error" in validated) return validated;
  const delivery = validateDelivery(body);
  if ("error" in delivery) return delivery;

  const { search } = validated;
  const searchChanged = SEARCH_KEYS.some((k) => search[k] !== existing[k]);
  const targetChanged =
    delivery.delivery.target_price !== (existing.target_price === null ? null : Number(existing.target_price));
  const forgetNotice = { last_notified_price: null, last_notified_at: null };

  const fields: Partial<Alert> = {
    ...search,
    ...delivery.delivery,
    origin_label: labelFor(search.origin),
    destination_label: labelFor(search.destination),
    ...(targetChanged ? forgetNotice : {}),
    ...(searchChanged
      ? {
          last_price: null, best_outbound: null, best_return: null, best_airline: null,
          grid: {}, options: [],
          typical_low: null, typical_high: null, insights_at: null,
          last_checked_at: null, last_error: null,
          ...forgetNotice,
          ...typicalFields(body),
        }
      : {}),
  };
  return { fields, searchChanged };
}

// Pausar o reanudar ({ active }), o editar la alerta completa (los mismos campos que al crearla).
export async function PATCH(request: Request, { params }: Context) {
  const denied = requireAccess(request);
  if (denied) return denied;
  const db = getDb();
  if (!db) return noDb();

  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
  }

  let fields: Partial<Alert>;
  let searchChanged = false;
  if (typeof body.active === "boolean" && Object.keys(body).length === 1) {
    fields = { active: body.active };
  } else {
    const { data: existing } = await db.from(TABLE).select("*").eq("id", id).maybeSingle();
    if (!existing) return NextResponse.json({ error: "La alerta ya no existe." }, { status: 404 });
    const edit = editFields(existing as Alert, body);
    if ("error" in edit) return NextResponse.json({ error: edit.error }, { status: 400 });
    ({ fields, searchChanged } = edit);
  }

  const { data, error } = await db.from(TABLE).update(fields).eq("id", id).select().maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "La alerta ya no existe." }, { status: 404 });
  // El historial de otra ruta o de otras fechas falsearia la mediana con la que se compara.
  if (searchChanged) await db.from(HISTORY_TABLE).delete().eq("alert_id", id);
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
