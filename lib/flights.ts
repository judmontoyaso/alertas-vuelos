import type { Alert } from "./types";

export type FlightQuote = { price: number; level: string | null };

type Route = Pick<Alert, "origin" | "destination" | "outbound_date" | "return_date" | "currency">;

export function routeKey(a: Route) {
  return [a.origin, a.destination, a.outbound_date, a.return_date ?? "", a.currency].join("|");
}

export function googleFlightsUrl(a: Route) {
  const q = `Flights from ${a.origin} to ${a.destination} on ${a.outbound_date}${
    a.return_date ? ` through ${a.return_date}` : " one way"
  }`;
  return `https://www.google.com/travel/flights?q=${encodeURIComponent(q)}&curr=${a.currency}`;
}

// Precio mas bajo que Google Flights muestra para la ruta, via SerpApi (1 credito por llamada).
export async function getLowestPrice(a: Route): Promise<FlightQuote | null> {
  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) throw new Error("Falta la variable SERPAPI_KEY.");

  const params = new URLSearchParams({
    engine: "google_flights",
    departure_id: a.origin,
    arrival_id: a.destination,
    outbound_date: a.outbound_date,
    currency: a.currency,
    hl: "es",
    type: a.return_date ? "1" : "2", // 1 = ida y vuelta, 2 = solo ida
    api_key: apiKey,
  });
  if (a.return_date) params.set("return_date", a.return_date);

  const res = await fetch(`https://serpapi.com/search?${params}`, { cache: "no-store" });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data || data.error) {
    const message: string = data?.error ?? `SerpApi respondió ${res.status}`;
    // Google Flights sin resultados no es un fallo: simplemente no hay precio.
    if (/hasn't returned any results/i.test(message)) return null;
    throw new Error(message);
  }

  const listed = [...(data.best_flights ?? []), ...(data.other_flights ?? [])]
    .map((f: { price?: number }) => f.price)
    .filter((p): p is number => typeof p === "number");
  const price = data.price_insights?.lowest_price ?? (listed.length ? Math.min(...listed) : null);
  if (typeof price !== "number") return null;
  return { price, level: data.price_insights?.price_level ?? null };
}
