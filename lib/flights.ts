import { MAX_OPTIONS, type Currency, type FlightOption } from "./types";

// Cada funcion de este archivo gasta una busqueda de SerpApi.

type Route = { origin: string; destination: string; currency: Currency };

export type DayPrice = { outbound: string; return: string | null; price: number };
export type Insights = {
  lowest: number | null;
  level: string | null;
  typical: [number, number] | null;
  history: [number, number][]; // [segundos unix, precio]
};
export type Deal = {
  price: number | null;
  outbound: string | null;
  return: string | null;
  airline: string | null;
  options: FlightOption[];
};

export function googleFlightsUrl(
  origin: string,
  destination: string,
  outbound: string | null,
  ret: string | null,
  currency: string,
) {
  const from = origin.split(",")[0];
  const to = destination.split(",")[0];
  const when = outbound ? ` on ${outbound}${ret ? ` through ${ret}` : " one way"}` : "";
  const q = `Flights from ${from} to ${to}${when}`;
  return `https://www.google.com/travel/flights?q=${encodeURIComponent(q)}&curr=${currency}`;
}

async function serpapi(params: Record<string, string>) {
  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) throw new Error("Falta la variable SERPAPI_KEY.");

  const query = new URLSearchParams({ hl: "es", gl: "co", ...params, api_key: apiKey });
  const res = await fetch(`https://serpapi.com/search?${query}`, { cache: "no-store" });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data || data.error) {
    const message: string = data?.error ?? `SerpApi respondió ${res.status}`;
    // Sin resultados no es un fallo: Google no tiene precios para esa consulta.
    if (/hasn't returned any results|empty results/i.test(message)) return null;
    throw new Error(message);
  }
  return data;
}

// Precio mas barato por fecha de salida dentro de un rango. Con `days`, ida y vuelta de esa duracion.
export async function getCalendar(
  route: Route & { start: string; end: string; days?: number },
): Promise<DayPrice[]> {
  const data = await serpapi({
    engine: "google_flights_calendar",
    departure_id: route.origin,
    arrival_id: route.destination,
    currency: route.currency,
    date_range_start: route.start,
    date_range_end: route.end,
    ...(route.days ? { type: "1", round_trip_days: String(route.days) } : { type: "2" }),
  });
  const prices: { outbound_date: string; return_date?: string; price?: number }[] =
    data?.prices ?? [];
  return prices
    .filter((p) => typeof p.price === "number")
    .map((p) => ({ outbound: p.outbound_date, return: p.return_date ?? null, price: p.price! }));
}

// Las fechas mas baratas de los proximos meses hacia un destino (Google Explorar).
export async function getDeal(
  route: Route & { round_trip: boolean; month: number; trip_length: number },
): Promise<Deal> {
  const data = await serpapi({
    engine: "google_travel_explore",
    departure_id: route.origin,
    arrival_id: route.destination,
    currency: route.currency,
    type: route.round_trip ? "1" : "2",
    month: String(route.month),
    travel_duration: String(route.trip_length),
  });
  const flights: { price?: number; airline?: string; number_of_stops?: number }[] = data?.flights ?? [];
  const priced = flights
    .filter((f) => typeof f.price === "number")
    .sort((a, b) => a.price! - b.price!);
  const outbound: string | null = data?.start_date ?? null;
  const ret: string | null = route.round_trip ? (data?.end_date ?? null) : null;
  return {
    price: priced[0]?.price ?? null,
    outbound,
    return: ret,
    // Explorar da una sola pareja de fechas; las opciones son las aerolineas que vuelan esos dias.
    options: outbound
      ? priced.slice(0, MAX_OPTIONS).map((f) => ({
          price: f.price!,
          out: outbound,
          ret,
          airline: f.airline ?? null,
          stops: typeof f.number_of_stops === "number" ? f.number_of_stops : null,
        }))
      : [],
    // Si hay vuelos pero ninguno con precio, la aerolinea ayuda a explicar por que.
    airline: (priced[0] ?? flights[0])?.airline ?? null,
  };
}

// Rango habitual e historial de precios que Google muestra para unas fechas concretas.
export async function getInsights(
  route: Route & { outbound: string; return: string | null },
): Promise<Insights> {
  const data = await serpapi({
    engine: "google_flights",
    departure_id: route.origin,
    arrival_id: route.destination,
    currency: route.currency,
    outbound_date: route.outbound,
    ...(route.return ? { type: "1", return_date: route.return } : { type: "2" }),
  });
  const insights = data?.price_insights ?? {};
  const range = insights.typical_price_range;
  const history: unknown[] = Array.isArray(insights.price_history) ? insights.price_history : [];
  return {
    lowest: typeof insights.lowest_price === "number" ? insights.lowest_price : null,
    level: insights.price_level ?? null,
    typical: Array.isArray(range) && range.length === 2 ? [range[0], range[1]] : null,
    history: history.filter(
      (h): h is [number, number] => Array.isArray(h) && h.length === 2 && typeof h[1] === "number",
    ),
  };
}
