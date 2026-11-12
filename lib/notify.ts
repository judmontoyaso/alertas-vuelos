import { googleFlightsUrl } from "./flights";
import { formatPrice, type Alert } from "./types";

export const channels = {
  email: () => Boolean(process.env.RESEND_API_KEY),
  telegram: () => Boolean(process.env.TELEGRAM_BOT_TOKEN),
};

type Found = { price: number; outbound: string; return: string | null; airline: string | null; threshold: number };

function message(alert: Alert, found: Found) {
  const price = formatPrice(found.price, alert.currency);
  const trip = found.return
    ? `saliendo el ${found.outbound} y regresando el ${found.return}`
    : `solo ida, saliendo el ${found.outbound}`;
  const reference =
    alert.target_price !== null
      ? `Tu tope era ${formatPrice(found.threshold, alert.currency)}.`
      : `Está por debajo de lo habitual para esta ruta (${formatPrice(found.threshold, alert.currency)}).`;
  return {
    subject: `${alert.origin_label} a ${alert.destination_label} por ${price}`,
    text: [
      `${alert.origin_label} a ${alert.destination_label} está en ${price}, ${trip}${
        found.airline ? ` con ${found.airline}` : ""
      }.`,
      reference,
      "",
      `Ver en Google Flights: ${googleFlightsUrl(alert.origin, alert.destination, found.outbound, found.return, alert.currency)}`,
    ].join("\n"),
  };
}

async function sendEmail(to: string, subject: string, text: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.ALERT_FROM_EMAIL ?? "Alertas de vuelos <onboarding@resend.dev>",
      to,
      subject,
      text,
    }),
  });
  if (!res.ok) throw new Error(`Resend respondió ${res.status}: ${await res.text()}`);
}

async function sendTelegram(chatId: string, text: string) {
  const res = await fetch(
    `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    },
  );
  if (!res.ok) throw new Error(`Telegram respondió ${res.status}: ${await res.text()}`);
}

// Envia por cada canal configurado; devuelve true si al menos uno salio.
export async function sendNotification(alert: Alert, found: Found): Promise<boolean> {
  const { subject, text } = message(alert, found);
  const jobs: Promise<void>[] = [];
  if (alert.email && channels.email()) jobs.push(sendEmail(alert.email, subject, text));
  if (alert.telegram_chat_id && channels.telegram()) {
    jobs.push(sendTelegram(alert.telegram_chat_id, `${subject}\n\n${text}`));
  }
  const results = await Promise.allSettled(jobs);
  for (const r of results) {
    if (r.status === "rejected") console.error("Error enviando alerta:", r.reason);
  }
  return results.some((r) => r.status === "fulfilled");
}
