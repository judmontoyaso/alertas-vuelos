import { getDb, HISTORY_TABLE, TABLE } from "./db";
import { getInsights } from "./flights";
import { sendNotification } from "./notify";
import { findBest, noPriceMessage } from "./search";
import { todayIso, type Alert, type CheckResult } from "./types";

const BATCH_SIZE = 3;
const MAX_CALLS_PER_ALERT = 3;
const DAY_MS = 24 * 60 * 60 * 1000;
const INSIGHTS_MAX_AGE_MS = 7 * DAY_MS;
const RENOTIFY_AFTER_MS = 7 * DAY_MS;
const MIN_HISTORY = 5;

const olderThan = (iso: string | null, ms: number) =>
  iso === null || Date.now() - new Date(iso).getTime() > ms;

// Solo se repite el aviso si el precio bajo al menos 2 % desde el ultimo, o paso una semana.
function shouldNotify(alert: Alert, price: number, threshold: number) {
  if (price > threshold) return false;
  if (alert.last_notified_price === null) return true;
  if (price <= alert.last_notified_price * 0.98) return true;
  return olderThan(alert.last_notified_at, RENOTIFY_AFTER_MS);
}

export async function checkAlert(alert: Alert): Promise<CheckResult> {
  const db = getDb();
  if (!db) throw new Error("Falta configurar Supabase.");
  const update = (fields: Partial<Alert>) => db.from(TABLE).update(fields).eq("id", alert.id);

  if (alert.mode === "dates" && alert.out_to! < todayIso()) {
    const error = "Las fechas de ida ya pasaron; la alerta quedó en pausa.";
    await update({ active: false, last_error: error });
    return { id: alert.id, price: null, notified: false, error };
  }

  const best = await findBest(alert, alert.grid ?? {}, MAX_CALLS_PER_ALERT);
  const now = new Date().toISOString();
  if (best.price === null || !best.outbound) {
    const error = noPriceMessage(best);
    await update({ grid: best.grid, last_checked_at: now, last_error: error });
    return { id: alert.id, price: null, notified: false, error };
  }

  // Sin tope elegido, la referencia es la parte baja del rango habitual de Google.
  let { typical_low, typical_high, insights_at } = alert;
  if (alert.target_price === null && (typical_low === null || olderThan(insights_at, INSIGHTS_MAX_AGE_MS))) {
    const insights = await getInsights({
      origin: alert.origin, destination: alert.destination, currency: alert.currency,
      outbound: best.outbound, return: best.return,
    });
    typical_low = insights.typical?.[0] ?? null;
    typical_high = insights.typical?.[1] ?? null;
    insights_at = now;
  }

  let threshold = alert.target_price ?? typical_low;
  if (threshold === null) {
    // Google no dio rango: se compara contra la mediana de lo que la app ha visto.
    const { data } = await db
      .from(HISTORY_TABLE)
      .select("price")
      .eq("alert_id", alert.id)
      .order("checked_at", { ascending: false })
      .limit(30);
    const seen = (data ?? []).map((r) => Number(r.price)).sort((a, b) => a - b);
    if (seen.length >= MIN_HISTORY) threshold = seen[Math.floor(seen.length / 2)] * 0.9;
  }

  await db.from(HISTORY_TABLE).insert({
    alert_id: alert.id,
    price: best.price,
    outbound_date: best.outbound,
    return_date: best.return,
  });

  const notified =
    threshold !== null && shouldNotify(alert, best.price, threshold)
      ? await sendNotification(alert, { ...best, price: best.price, outbound: best.outbound, threshold })
      : false;

  const { error } = await update({
    last_price: best.price,
    best_outbound: best.outbound,
    best_return: best.return,
    best_airline: best.airline,
    grid: best.grid,
    options: best.options,
    typical_low,
    typical_high,
    insights_at,
    last_checked_at: now,
    last_error: null,
    ...(notified ? { last_notified_price: best.price, last_notified_at: now } : {}),
  });
  return { id: alert.id, price: best.price, notified, error: error?.message };
}

export async function checkAlerts(alerts: Alert[]): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  for (let i = 0; i < alerts.length; i += BATCH_SIZE) {
    const batch = await Promise.all(
      alerts.slice(i, i + BATCH_SIZE).map(async (alert) => {
        try {
          return await checkAlert(alert);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`Error revisando ${alert.origin}-${alert.destination}:`, message);
          // Queda a la vista en la tarjeta en vez de fallar en silencio.
          await getDb()
            ?.from(TABLE)
            .update({ last_error: message, last_checked_at: new Date().toISOString() })
            .eq("id", alert.id);
          return { id: alert.id, price: null, notified: false, error: message };
        }
      }),
    );
    results.push(...batch);
  }
  return results;
}
