import { isValidCodes } from "./airports";
import { getCalendar, getDeal, getInsights } from "./flights";
import {
  addDays,
  CURRENCIES,
  daysBetween,
  todayIso,
  tripDurations,
  type Currency,
  type GridCell,
  type Quote,
  type Search,
  type Suggestion,
} from "./types";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 31;
const MAX_DURATIONS = 30;

export type Best = {
  price: number | null;
  outbound: string | null;
  return: string | null;
  airline: string | null;
  grid: Record<string, GridCell>;
};

const maxDate = (a: string, b: string) => (a > b ? a : b);
const minDate = (a: string, b: string) => (a < b ? a : b);

export function validateSearch(body: Record<string, unknown>): { search: Search } | { error: string } {
  const mode = body.mode === "deal" ? "deal" : "dates";
  const origin = String(body.origin ?? "").toUpperCase();
  const destination = String(body.destination ?? "").toUpperCase();
  const round_trip = body.round_trip !== false;
  const currency = String(body.currency ?? "COP") as Currency;
  const date = (v: unknown) => (typeof v === "string" && DATE.test(v) ? v : null);
  const today = todayIso();

  if (!isValidCodes(origin) || !isValidCodes(destination)) {
    return { error: "Elige el origen y el destino de la lista de aeropuertos." };
  }
  if (origin.split(",").some((c) => destination.split(",").includes(c))) {
    return { error: "El destino debe ser distinto del origen." };
  }
  if (!CURRENCIES.includes(currency)) return { error: "Moneda no admitida." };

  if (mode === "deal") {
    const month = Number(body.month ?? 0);
    const trip_length = Number(body.trip_length ?? 2);
    if (!Number.isInteger(month) || month < 0 || month > 12) return { error: "Mes inválido." };
    if (![1, 2, 3].includes(trip_length)) return { error: "Duración inválida." };
    return {
      search: {
        mode, origin, destination, round_trip, currency, month, trip_length,
        out_from: null, out_to: null, ret_from: null, ret_to: null,
      },
    };
  }

  const out_from = date(body.out_from);
  const out_to = date(body.out_to) ?? out_from;
  const ret_from = round_trip ? date(body.ret_from) : null;
  const ret_to = round_trip ? (date(body.ret_to) ?? ret_from) : null;
  if (!out_from || !out_to || out_from < today || out_to < out_from) {
    return { error: "El rango de ida debe empezar hoy o después, y terminar después de empezar." };
  }
  if (daysBetween(out_from, out_to) > MAX_RANGE_DAYS) {
    return { error: `El rango de ida no puede pasar de ${MAX_RANGE_DAYS} días.` };
  }
  const search: Search = {
    mode, origin, destination, round_trip, currency, month: 0, trip_length: 2,
    out_from, out_to, ret_from, ret_to,
  };
  if (round_trip) {
    if (!ret_from || !ret_to || ret_to < ret_from) {
      return { error: "Indica el rango de regreso." };
    }
    if (ret_from < out_from || ret_to <= out_from) {
      return { error: "El regreso debe ser posterior a la ida." };
    }
    if (daysBetween(ret_from, ret_to) > MAX_RANGE_DAYS) {
      return { error: `El rango de regreso no puede pasar de ${MAX_RANGE_DAYS} días.` };
    }
    const count = tripDurations(search).length;
    if (count === 0) return { error: "El regreso debe ser posterior a la ida." };
    if (count > MAX_DURATIONS) {
      return { error: "Los rangos son demasiado amplios; acórtalos un poco." };
    }
  }
  return { search };
}

// Busca el mejor precio gastando como mucho `maxCalls` busquedas. En ida y vuelta por rangos
// cada duracion de viaje es una busqueda; `grid` recuerda las ya consultadas y se van rotando.
export async function findBest(
  s: Search,
  previous: Record<string, GridCell>,
  maxCalls: number,
): Promise<Best> {
  const route = { origin: s.origin, destination: s.destination, currency: s.currency };

  if (s.mode === "deal") {
    const deal = await getDeal({ ...route, round_trip: s.round_trip, month: s.month, trip_length: s.trip_length });
    return { ...deal, grid: {} };
  }

  const today = todayIso();
  const start = maxDate(s.out_from!, today);
  const now = new Date().toISOString();

  if (!s.round_trip) {
    const days = await getCalendar({ ...route, start, end: s.out_to! });
    const best = days.sort((a, b) => a.price - b.price)[0];
    return { price: best?.price ?? null, outbound: best?.outbound ?? null, return: null, airline: null, grid: {} };
  }

  const durations = tripDurations(s);
  const grid: Record<string, GridCell> = {};
  for (const d of durations) if (previous[d]) grid[d] = previous[d];

  // Primero las duraciones nunca consultadas (empezando por la del medio), luego las mas antiguas.
  const middle = durations[Math.floor(durations.length / 2)];
  const queue = [...durations].sort((a, b) => {
    const [x, y] = [grid[a]?.at ?? "", grid[b]?.at ?? ""];
    return x.localeCompare(y) || Math.abs(a - middle) - Math.abs(b - middle);
  });

  let calls = 0;
  for (const d of queue) {
    if (calls >= maxCalls) break;
    const from = maxDate(start, addDays(s.ret_from!, -d));
    const to = minDate(s.out_to!, addDays(s.ret_to!, -d));
    if (from > to) {
      grid[d] = { price: null, at: now };
      continue;
    }
    calls++;
    const days = await getCalendar({ ...route, start: from, end: to, days: d });
    const best = days
      .filter((p) => p.outbound >= from && p.outbound <= to)
      .sort((a, b) => a.price - b.price)[0];
    grid[d] = best
      ? { price: best.price, out: best.outbound, ret: best.return ?? addDays(best.outbound, d), at: now }
      : { price: null, at: now };
  }

  const best = Object.values(grid)
    .filter((c): c is GridCell & { price: number; out: string } => c.price !== null && !!c.out && c.out >= today)
    .sort((a, b) => a.price - b.price)[0];
  return {
    price: best?.price ?? null,
    outbound: best?.out ?? null,
    return: best?.ret ?? null,
    airline: null,
    grid,
  };
}

export function noPriceMessage(best: Best) {
  return best.airline
    ? `Google Flights conoce la ruta (${best.airline}) pero no publica su precio, así que no se puede vigilar.`
    : "Google Flights no tiene precios para esta búsqueda.";
}

const roundDown = (value: number, currency: Currency) =>
  currency === "COP" ? Math.floor(value / 1000) * 1000 : Math.floor(value);

// Vista previa para el formulario: precio de hoy y topes sugeridos segun el historial de Google.
export async function getQuote(s: Search): Promise<Quote> {
  const best = await findBest(s, {}, 1);
  const empty = { typical: null, level: null, history_days: 0, suggestions: [] };
  if (best.price === null || !best.outbound) {
    return { price: null, outbound: null, return: null, airline: best.airline, ...empty, message: noPriceMessage(best) };
  }

  const insights = await getInsights({
    origin: s.origin, destination: s.destination, currency: s.currency,
    outbound: best.outbound, return: best.return,
  });
  const historyPrices = insights.history.map((h) => h[1]);
  const history_days = insights.history.length
    ? Math.round((insights.history.at(-1)![0] - insights.history[0][0]) / 86400) + 1
    : 0;

  const candidates: Suggestion[] = [
    { label: "5 % menos que hoy", value: best.price * 0.95 },
    { label: "10 % menos que hoy", value: best.price * 0.9 },
  ];
  if (insights.typical) {
    candidates.push({ label: "Parte baja del rango habitual", value: insights.typical[0] });
  }
  if (historyPrices.length) {
    candidates.push({
      label: `Mínimo de los últimos ${history_days} días`,
      value: Math.min(...historyPrices),
    });
  }
  const seen = new Set<number>();
  const suggestions = candidates
    .map((c) => ({ ...c, value: roundDown(c.value, s.currency) }))
    .filter((c) => c.value > 0 && !seen.has(c.value) && seen.add(c.value))
    .sort((a, b) => b.value - a.value);

  return {
    price: best.price,
    outbound: best.outbound,
    return: best.return,
    airline: best.airline,
    typical: insights.typical,
    level: insights.level,
    history_days,
    suggestions,
  };
}
