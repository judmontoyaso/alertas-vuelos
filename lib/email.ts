import { googleFlightsUrl } from "./flights";
import { cityOf, describeAlert, formatDate } from "./format";
import { formatPrice, type Alert } from "./types";

// Plantillas de correo. HTML con tablas y estilos en linea, que es lo que entienden
// Gmail y Outlook; misma señaletica que el panel: amarillo de letrero y tinta azul noche.

export type Email = { subject: string; html: string; text: string };
export type Found = {
  price: number;
  outbound: string;
  return: string | null;
  airline: string | null;
  threshold: number;
};

const INK = "#10213a";
const MUTED = "#56667e";
const LINE = "#c5d2e0";
const SKY = "#e4ecf4";
const SIGN = "#ffc61a";
const DROP = "#0b7a4f";
const DISPLAY = "'Barlow Condensed','Arial Narrow',Arial,Helvetica,sans-serif";
const BODY = "Barlow,Arial,Helvetica,sans-serif";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function appUrl() {
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return host ? `https://${host}` : null;
}

type Layout = {
  preheader: string;
  heading: string;
  intro: string;
  alert: Alert;
  highlight?: { value: string; caption: string };
  rows: [string, string][];
  cta?: { label: string; url: string };
  footer: string;
};

function layout(l: Layout) {
  const codes = (value: string) => esc(value.replaceAll(",", " / "));
  const rows = l.rows
    .map(
      ([name, value]) => `
            <tr>
              <td style="padding:10px 0;border-top:1px solid ${LINE};font:600 14px ${BODY};color:${MUTED};width:38%;vertical-align:top;">${esc(name)}</td>
              <td style="padding:10px 0;border-top:1px solid ${LINE};font:400 15px/1.45 ${BODY};color:${INK};vertical-align:top;">${esc(value)}</td>
            </tr>`,
    )
    .join("");
  const highlight = l.highlight
    ? `
        <tr>
          <td style="padding:0 32px 24px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#dcf3e8;border-radius:8px;border-left:6px solid ${DROP};">
              <tr><td style="padding:16px 20px;">
                <div style="font:700 38px/1 ${DISPLAY};color:${DROP};">${esc(l.highlight.value)}</div>
                <div style="font:500 14px/1.4 ${BODY};color:${INK};padding-top:6px;">${esc(l.highlight.caption)}</div>
              </td></tr>
            </table>
          </td>
        </tr>`
    : "";
  const cta = l.cta
    ? `
        <tr>
          <td style="padding:8px 32px 32px;">
            <a href="${esc(l.cta.url)}" style="display:inline-block;background:${INK};color:#ffffff;font:600 16px ${BODY};text-decoration:none;padding:13px 24px;border-radius:6px;">${esc(l.cta.label)}</a>
          </td>
        </tr>`
    : "";

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${esc(l.heading)}</title>
</head>
<body style="margin:0;padding:0;background:${SKY};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(l.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${SKY};">
  <tr>
    <td align="center" style="padding:24px 12px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;">
        <tr>
          <td style="background:${SIGN};border-bottom:4px solid ${INK};padding:18px 32px;">
            <table role="presentation" cellpadding="0" cellspacing="0"><tr>
              <td style="background:${INK};color:${SIGN};width:40px;height:40px;border-radius:6px;text-align:center;font-size:22px;line-height:40px;">&#9992;</td>
              <td style="padding-left:12px;font:700 26px/1 ${DISPLAY};color:${INK};">Alertas de vuelos</td>
            </tr></table>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 32px 8px;">
            <h1 style="margin:0;font:700 30px/1.1 ${DISPLAY};color:${INK};">${esc(l.heading)}</h1>
            <p style="margin:12px 0 0;font:400 16px/1.5 ${BODY};color:${INK};">${esc(l.intro)}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px 24px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${LINE};border-radius:8px;">
              <tr><td style="padding:18px 20px;">
                <div style="font:700 44px/1 ${DISPLAY};color:${INK};letter-spacing:1px;">${codes(l.alert.origin)} <span style="color:${MUTED};font-size:28px;">&#9992;</span> ${codes(l.alert.destination)}</div>
                <div style="font:600 16px/1.4 ${BODY};color:${INK};padding-top:8px;">${esc(cityOf(l.alert.origin_label))} a ${esc(cityOf(l.alert.destination_label))}</div>
              </td></tr>
            </table>
          </td>
        </tr>${highlight}
        <tr>
          <td style="padding:0 32px 16px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-bottom:1px solid ${LINE};">${rows}
            </table>
          </td>
        </tr>${cta}
        <tr>
          <td style="background:#f6f9fc;border-top:1px solid ${LINE};padding:18px 32px;font:400 13px/1.5 ${BODY};color:${MUTED};">${esc(l.footer)}</td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

function textVersion(l: Layout) {
  return [
    l.heading,
    "",
    l.intro,
    "",
    `${l.alert.origin_label} a ${l.alert.destination_label}`,
    ...(l.highlight ? [`${l.highlight.value} (${l.highlight.caption})`] : []),
    ...l.rows.map(([name, value]) => `${name}: ${value}`),
    ...(l.cta ? ["", `${l.cta.label}: ${l.cta.url}`] : []),
    "",
    l.footer,
  ].join("\n");
}

const FOOTER = "Recibes este correo porque se creó una alerta de precios con esta dirección en Alertas de vuelos.";

// Se envia al crear la alerta.
export function confirmationEmail(alert: Alert): Email {
  const route = `${cityOf(alert.origin_label)} a ${cityOf(alert.destination_label)}`;
  const target =
    alert.target_price !== null ? formatPrice(alert.target_price, alert.currency) : null;
  const url = appUrl();
  const l: Layout = {
    preheader: `Vigilamos ${route} y te avisamos cuando baje.`,
    heading: "Ya estamos vigilando tu vuelo",
    intro: target
      ? `Te escribiremos a este correo cuando el precio baje a ${target} o menos.`
      : "Te escribiremos a este correo cuando el precio baje de lo habitual para esta ruta.",
    alert,
    rows: [
      ["Fechas", describeAlert(alert)],
      ["Precio tope", target ?? "Automático, según el rango habitual de Google Flights"],
      ["Revisión", "Una vez al día, a las 7:00 a. m. (hora de Colombia)"],
    ],
    cta: url ? { label: "Ver mis alertas", url } : undefined,
    footer: FOOTER,
  };
  return { subject: `Alerta creada: ${route}`, html: layout(l), text: textVersion(l) };
}

// Se envia cuando el precio llega al tope.
export function priceEmail(alert: Alert, found: Found): Email {
  const route = `${cityOf(alert.origin_label)} a ${cityOf(alert.destination_label)}`;
  const price = formatPrice(found.price, alert.currency);
  const threshold = formatPrice(found.threshold, alert.currency);
  const l: Layout = {
    preheader: `${route} está en ${price}.`,
    heading: "Bajó el precio de tu vuelo",
    intro:
      alert.target_price !== null
        ? `El precio llegó al tope que pusiste (${threshold}).`
        : `El precio está por debajo de lo habitual para esta ruta (${threshold}).`,
    alert,
    highlight: { value: price, caption: found.return ? "Ida y vuelta, por persona" : "Solo ida, por persona" },
    rows: [
      ["Salida", formatDate(found.outbound)],
      ...(found.return ? ([["Regreso", formatDate(found.return)]] as [string, string][]) : []),
      ...(found.airline ? ([["Aerolínea", found.airline]] as [string, string][]) : []),
      ["Tu búsqueda", describeAlert(alert)],
    ],
    cta: {
      label: "Ver en Google Flights",
      url: googleFlightsUrl(alert.origin, alert.destination, found.outbound, found.return, alert.currency),
    },
    footer: `${FOOTER} Los precios cambian rápido: confirma el valor antes de comprar.`,
  };
  return { subject: `${route} por ${price}`, html: layout(l), text: textVersion(l) };
}
