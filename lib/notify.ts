import { confirmationEmail, priceEmail, type Email, type Found } from "./email";
import type { Alert } from "./types";

export const channels = {
  email: () => Boolean(process.env.RESEND_API_KEY),
  telegram: () => Boolean(process.env.TELEGRAM_BOT_TOKEN),
};

async function sendEmail(to: string, email: Email) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.ALERT_FROM_EMAIL ?? "Alertas de vuelos <onboarding@resend.dev>",
      to,
      ...email,
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
async function deliver(alert: Alert, email: Email): Promise<boolean> {
  const jobs: Promise<void>[] = [];
  if (alert.email && channels.email()) jobs.push(sendEmail(alert.email, email));
  if (alert.telegram_chat_id && channels.telegram()) {
    jobs.push(sendTelegram(alert.telegram_chat_id, email.text));
  }
  const results = await Promise.allSettled(jobs);
  for (const r of results) {
    if (r.status === "rejected") console.error("Error enviando aviso:", r.reason);
  }
  return results.some((r) => r.status === "fulfilled");
}

export const sendNotification = (alert: Alert, found: Found) => deliver(alert, priceEmail(alert, found));

export const sendConfirmation = (alert: Alert) => deliver(alert, confirmationEmail(alert));
