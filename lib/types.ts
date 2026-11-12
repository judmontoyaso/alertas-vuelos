export const CURRENCIES = ["COP", "USD", "EUR"] as const;
export type Currency = (typeof CURRENCIES)[number];

export type Alert = {
  id: string;
  origin: string;
  destination: string;
  outbound_date: string;
  return_date: string | null;
  currency: Currency;
  target_price: number;
  email: string | null;
  telegram_chat_id: string | null;
  active: boolean;
  last_price: number | null;
  last_price_level: string | null;
  last_checked_at: string | null;
  last_notified_price: number | null;
  last_notified_at: string | null;
  created_at: string;
};

export type CheckResult = {
  id: string;
  price: number | null;
  notified: boolean;
  error?: string;
};

export function formatPrice(amount: number, currency: string) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}
