import { googleFlightsUrl } from "./flights";
import { formatPrice, type Alert } from "./types";

export const channels = {
  email: () => Boolean(process.env.RESEND_API_KEY),
  telegram: () => Boolean(process.env.TELEGRAM_BOT_TOKEN),
};

function message(alert: Alert, price: number) {
  const trip = alert.return_date
    ? `ida ${alert.outbound_date}, vuelta ${alert.return_date}`
    : `solo ida ${alert.outbound_date}`;
  return {
    subject: `${alert.origin} a ${alert.destination} bajó a ${formatPrice(price, alert.currency)}`,
    text: [
      `El vuelo ${alert.origin} a ${alert.destination} (${trip}) está en ${formatPrice(price, alert.currency)}.`,
      `Tu tope era ${formatPrice(alert.target_price, alert.currency)}.`,
      "",
      `Ver en Google Flights: ${googleFlightsUrl(alert)}`,
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
export async function sendNotification(alert: Alert, price: number): Promise<boolean> {
  const { subject, text } = message(alert, price);
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
