import { TRIP_LENGTHS, type Alert } from "./types";

// Textos compartidos por las tarjetas del panel y los correos.

export function formatDate(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("es-CO", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatRange(from: string, to: string) {
  return from === to ? `el ${formatDate(from)}` : `entre el ${formatDate(from)} y el ${formatDate(to)}`;
}

export function monthName(month: number) {
  return new Date(2000, month - 1, 1).toLocaleDateString("es-CO", { month: "long" });
}

export const cityOf = (label: string) => label.split(" (")[0];

export function describeAlert(alert: Alert) {
  if (alert.mode === "deal") {
    const when = alert.month === 0 ? "en los próximos 6 meses" : `en ${monthName(alert.month)}`;
    return alert.round_trip
      ? `Cualquier fecha ${when}, viaje de ${TRIP_LENGTHS[alert.trip_length as 1 | 2 | 3].toLowerCase()}`
      : `Solo ida, cualquier fecha ${when}`;
  }
  const out = formatRange(alert.out_from!, alert.out_to!);
  return alert.round_trip
    ? `Ida ${out}, regreso ${formatRange(alert.ret_from!, alert.ret_to!)}`
    : `Solo ida ${out}`;
}
