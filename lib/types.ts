export const CURRENCIES = ["COP", "USD", "EUR"] as const;
export type Currency = (typeof CURRENCIES)[number];

// dates = rangos de fechas de ida y regreso; deal = cualquier fecha, la mas barata de los proximos meses
export type Mode = "dates" | "deal";

export const TRIP_LENGTHS = { 1: "Fin de semana", 2: "1 semana", 3: "2 semanas" } as const;

export type GridCell = { price: number | null; out?: string; ret?: string; at: string };

export type Alert = {
  id: string;
  mode: Mode;
  origin: string;
  origin_label: string;
  destination: string;
  destination_label: string;
  round_trip: boolean;
  out_from: string | null;
  out_to: string | null;
  ret_from: string | null;
  ret_to: string | null;
  month: number; // 0 = cualquier mes de los proximos seis
  trip_length: number;
  currency: Currency;
  target_price: number | null; // null = automatico, segun el rango habitual
  typical_low: number | null;
  typical_high: number | null;
  insights_at: string | null;
  email: string | null;
  telegram_chat_id: string | null;
  active: boolean;
  last_price: number | null;
  best_outbound: string | null;
  best_return: string | null;
  best_airline: string | null;
  grid: Record<string, GridCell>; // precio por duracion del viaje en dias
  last_checked_at: string | null;
  last_error: string | null;
  last_notified_price: number | null;
  last_notified_at: string | null;
  created_at: string;
};

// Lo que define una busqueda; lo comparten el formulario, la vista previa y la alerta.
export type Search = Pick<
  Alert,
  | "mode"
  | "origin"
  | "destination"
  | "round_trip"
  | "out_from"
  | "out_to"
  | "ret_from"
  | "ret_to"
  | "month"
  | "trip_length"
  | "currency"
>;

export type CheckResult = {
  id: string;
  price: number | null;
  notified: boolean;
  error?: string;
};

export type Suggestion = { label: string; value: number };

export type Quote = {
  price: number | null;
  outbound: string | null;
  return: string | null;
  airline: string | null;
  typical: [number, number] | null;
  level: string | null;
  history_days: number;
  suggestions: Suggestion[];
  message?: string;
};

export function formatPrice(amount: number, currency: string) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

export const todayIso = () => new Date().toISOString().slice(0, 10);

export function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}

// Duraciones posibles (en dias) de un viaje de ida y vuelta dentro de los dos rangos.
export function tripDurations(s: Pick<Search, "out_from" | "out_to" | "ret_from" | "ret_to">) {
  if (!s.out_from || !s.out_to || !s.ret_from || !s.ret_to) return [];
  const min = Math.max(1, daysBetween(s.out_to, s.ret_from));
  const max = daysBetween(s.out_from, s.ret_to);
  return Array.from({ length: Math.max(0, max - min + 1) }, (_, i) => min + i);
}
