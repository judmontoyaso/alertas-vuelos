import { getDb, TABLE } from "./db";
import { getLowestPrice, routeKey, type FlightQuote } from "./flights";
import { sendNotification } from "./notify";
import type { Alert, CheckResult } from "./types";

const BATCH_SIZE = 5;
const RENOTIFY_AFTER_MS = 48 * 60 * 60 * 1000;

// Solo se vuelve a avisar si el precio bajo mas que el ultimo aviso o ya pasaron 48 horas.
function shouldNotify(alert: Alert, price: number) {
  if (price > alert.target_price) return false;
  if (alert.last_notified_price === null || alert.last_notified_at === null) return true;
  if (price < alert.last_notified_price) return true;
  return Date.now() - new Date(alert.last_notified_at).getTime() > RENOTIFY_AFTER_MS;
}

export async function checkAlerts(alerts: Alert[]): Promise<CheckResult[]> {
  const db = getDb();
  if (!db) throw new Error("Falta configurar Supabase.");

  const today = new Date().toISOString().slice(0, 10);
  const expired = alerts.filter((a) => a.outbound_date < today);
  const pending = alerts.filter((a) => a.outbound_date >= today);
  if (expired.length) {
    await db.from(TABLE).update({ active: false }).in("id", expired.map((a) => a.id));
  }

  // Una sola consulta por ruta aunque varias alertas la compartan.
  const quotes = new Map<string, FlightQuote | null | Error>();
  const routes = [...new Map(pending.map((a) => [routeKey(a), a])).entries()];
  for (let i = 0; i < routes.length; i += BATCH_SIZE) {
    await Promise.all(
      routes.slice(i, i + BATCH_SIZE).map(async ([key, alert]) => {
        try {
          quotes.set(key, await getLowestPrice(alert));
        } catch (error) {
          quotes.set(key, error instanceof Error ? error : new Error(String(error)));
        }
      }),
    );
  }

  const results: CheckResult[] = expired.map((a) => ({
    id: a.id,
    price: null,
    notified: false,
    error: "La fecha de salida ya pasó; la alerta quedó en pausa.",
  }));

  for (const alert of pending) {
    const quote = quotes.get(routeKey(alert));
    if (quote instanceof Error) {
      console.error(`Error consultando ${routeKey(alert)}:`, quote.message);
      results.push({ id: alert.id, price: null, notified: false, error: quote.message });
      continue;
    }
    const now = new Date().toISOString();
    if (!quote) {
      await db.from(TABLE).update({ last_checked_at: now }).eq("id", alert.id);
      results.push({
        id: alert.id,
        price: null,
        notified: false,
        error: "Google Flights no tiene precios para esta ruta y fecha.",
      });
      continue;
    }

    const notified = shouldNotify(alert, quote.price)
      ? await sendNotification(alert, quote.price)
      : false;
    const { error } = await db
      .from(TABLE)
      .update({
        last_price: quote.price,
        last_price_level: quote.level,
        last_checked_at: now,
        ...(notified ? { last_notified_price: quote.price, last_notified_at: now } : {}),
      })
      .eq("id", alert.id);
    results.push({ id: alert.id, price: quote.price, notified, error: error?.message });
  }
  return results;
}
