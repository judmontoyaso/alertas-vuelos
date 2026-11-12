"use client";

import { bookingLink } from "@/lib/flights";
import { cityOf, describeAlert, describeOption, formatDate } from "@/lib/format";
import { formatPrice, tripDurations, type Alert } from "@/lib/types";

const PLANE = "M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z";

function formatChecked(iso: string) {
  return new Date(iso).toLocaleString("es-CO", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

type Props = {
  alert: Alert;
  busy: boolean;
  canCheck: boolean;
  onCheck: () => void;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
};

export default function AlertCard({ alert, busy, canCheck, onCheck, onEdit, onToggle, onDelete }: Props) {
  const threshold = alert.target_price ?? alert.typical_low;
  const hit = alert.last_price !== null && threshold !== null && alert.last_price <= threshold;
  const options = alert.options ?? [];
  const booking = bookingLink(alert, { out: alert.best_outbound, ret: alert.best_return, airline: alert.best_airline });
  const pendingDurations =
    alert.mode === "dates" && alert.round_trip
      ? tripDurations(alert).filter((d) => !alert.grid?.[d]).length
      : 0;

  return (
    <li className={`alert${hit ? " hit" : ""}${alert.active ? "" : " paused"}`}>
      <div className="alert-main">
        <div>
          <div className="route">
            <span>{alert.origin.replaceAll(",", "/")}</span>
            <span className="route-line" aria-hidden="true" />
            <svg
              width="26"
              height="26"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
              style={{ transform: "rotate(90deg)" }}
            >
              <path d={PLANE} />
            </svg>
            <span className="route-line" aria-hidden="true" />
            <span>{alert.destination.replaceAll(",", "/")}</span>
          </div>
          <p className="cities">
            {cityOf(alert.origin_label)} a {cityOf(alert.destination_label)}
          </p>
          <p className="dates">
            {describeAlert(alert)}
            {!alert.active && " (en pausa)"}
          </p>
          <p className="dates">
            Avisa a {[alert.email, alert.telegram_chat_id && `Telegram ${alert.telegram_chat_id}`]
              .filter(Boolean)
              .join(" y ")}
          </p>
        </div>
        <div className="prices">
          {alert.last_price !== null ? (
            <>
              <p className="now">{formatPrice(alert.last_price, alert.currency)}</p>
              {alert.best_outbound && (
                <p className="target">
                  Sale el {formatDate(alert.best_outbound)}
                  {alert.best_return && `, regresa el ${formatDate(alert.best_return)}`}
                  {alert.best_airline && `, ${alert.best_airline}`}
                </p>
              )}
            </>
          ) : (
            <p className="now empty">Sin precio todavía</p>
          )}
          <p className="target">
            {alert.target_price !== null
              ? `Tu tope: ${formatPrice(alert.target_price, alert.currency)}`
              : alert.typical_low !== null
                ? `Automático: avisa por debajo de ${formatPrice(alert.typical_low, alert.currency)}`
                : "Automático: avisa cuando baje de lo habitual"}
          </p>
          {alert.last_price !== null && threshold !== null && (
            <span className={`verdict${hit ? " hit" : ""}`}>
              {hit
                ? "Ya está en el precio que buscas"
                : `Le faltan ${formatPrice(alert.last_price - threshold, alert.currency)} por bajar`}
            </span>
          )}
        </div>
      </div>
      {options.length > 1 && (
        <div className="options">
          <h3>Opciones encontradas</h3>
          <ol>
            {options.map((o, i) => (
              <li key={`${o.out}-${o.ret}-${o.airline}-${i}`}>
                <a
                  href={bookingLink(alert, o).url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <strong>{formatPrice(o.price, alert.currency)}</strong>
                  <span>{describeOption(o)}</span>
                </a>
              </li>
            ))}
          </ol>
        </div>
      )}
      {alert.last_error && <p className="alert-note">{alert.last_error}</p>}
      {!alert.last_error && alert.last_checked_at && pendingDurations > 0 && (
        <p className="alert-note">
          Faltan {pendingDurations} combinaciones de fechas por revisar; se consultan 3 por día.
        </p>
      )}
      <div className="alert-foot">
        <span>
          {alert.last_checked_at ? `Revisado ${formatChecked(alert.last_checked_at)}` : "Aún sin revisar"}
          {". "}
          <a href={booking.url} target="_blank" rel="noopener noreferrer">
            {booking.label}
          </a>
        </span>
        <span className="actions">
          <button className="btn quiet" disabled={busy || !canCheck} onClick={onCheck}>
            {busy ? "Consultando…" : "Consultar precio ahora"}
          </button>
          <button className="btn quiet" disabled={busy} onClick={onEdit}>
            Editar
          </button>
          <button className="btn quiet" disabled={busy} onClick={onToggle}>
            {alert.active ? "Pausar" : "Reanudar"}
          </button>
          <button className="btn quiet danger" disabled={busy} onClick={onDelete}>
            Eliminar
          </button>
        </span>
      </div>
    </li>
  );
}
