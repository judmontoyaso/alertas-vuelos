"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { googleFlightsUrl } from "@/lib/flights";
import { CURRENCIES, formatPrice, type Alert } from "@/lib/types";

type Config = { flights: boolean; email: boolean; telegram: boolean };
type View = "loading" | "gate" | "ready" | "setup";

const CODE_KEY = "vuelos-access-code";

function readCode() {
  try {
    return localStorage.getItem(CODE_KEY) ?? "";
  } catch {
    return "";
  }
}

function formatDate(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("es-CO", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatChecked(iso: string) {
  return new Date(iso).toLocaleString("es-CO", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function AlertsApp() {
  const [view, setView] = useState<View>("loading");
  const [code, setCode] = useState("");
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [config, setConfig] = useState<Config | null>(null);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [roundTrip, setRoundTrip] = useState(true);

  const api = useCallback(
    async (path: string, init: RequestInit = {}, accessCode = code) => {
      const res = await fetch(path, {
        ...init,
        headers: { "Content-Type": "application/json", "x-access-code": accessCode },
      });
      const data = await res.json().catch(() => ({}));
      return { res, data };
    },
    [code],
  );

  const load = useCallback(
    async (accessCode: string) => {
      const { res, data } = await api("/api/alerts", {}, accessCode);
      if (res.status === 401) {
        setError(accessCode ? data.error : "");
        setView("gate");
        return;
      }
      if (!res.ok) {
        setError(data.error ?? "No se pudieron cargar las alertas.");
        setView("setup");
        return;
      }
      setError("");
      setAlerts(data.alerts);
      setConfig(data.config);
      setView("ready");
    },
    [api],
  );

  useEffect(() => {
    const saved = readCode();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lectura inicial de localStorage
    setCode(saved);
    load(saved);
    // Solo al montar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function enter(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    try {
      localStorage.setItem(CODE_KEY, code);
    } catch {}
    await load(code);
  }

  async function createAlert(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    setSaving(true);
    setFormError("");
    const { res, data } = await api("/api/alerts", {
      method: "POST",
      body: JSON.stringify({ ...values, return_date: roundTrip ? values.return_date : null }),
    });
    setSaving(false);
    if (!res.ok) {
      setFormError(data.error ?? "No se pudo guardar la alerta.");
      return;
    }
    setAlerts((list) => [data.alert, ...list]);
    form.reset();
  }

  async function act(alert: Alert, init: RequestInit) {
    setBusyId(alert.id);
    setError("");
    const { res, data } = await api(`/api/alerts/${alert.id}`, init);
    setBusyId(null);
    if (!res.ok) {
      setError(data.error ?? "No se pudo completar la acción.");
      return;
    }
    if (init.method === "DELETE") {
      setAlerts((list) => list.filter((a) => a.id !== alert.id));
      return;
    }
    setAlerts((list) => list.map((a) => (a.id === alert.id ? data.alert : a)));
    if (data.result?.error) setError(`${alert.origin} a ${alert.destination}: ${data.result.error}`);
  }

  if (view === "loading") {
    return (
      <main className="gate">
        <p>Cargando alertas…</p>
      </main>
    );
  }

  if (view === "gate") {
    return (
      <main className="gate">
        <form className="panel" onSubmit={enter}>
          <h2>Código de acceso</h2>
          <div className="field">
            <label htmlFor="code">Código</label>
            <input
              id="code"
              type="password"
              autoComplete="current-password"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              autoFocus
            />
            <small>Es el valor de ACCESS_TOKEN configurado en Vercel.</small>
          </div>
          {error && <p className="notice error">{error}</p>}
          <button className="btn primary">Entrar</button>
        </form>
      </main>
    );
  }

  if (view === "setup") {
    return (
      <main className="gate">
        <div className="panel">
          <h2>Falta configuración</h2>
          <p className="notice error">{error}</p>
          <p style={{ marginTop: "1rem" }}>
            Agrega las variables en Vercel (Settings, Environment Variables), crea la tabla con{" "}
            <code>supabase/schema.sql</code> y vuelve a desplegar.
          </p>
        </div>
      </main>
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const active = alerts.filter((a) => a.active).length;

  return (
    <main className="layout">
      <section className="panel form-panel" aria-labelledby="new-alert">
        <h2 id="new-alert">Vigilar una ruta</h2>
        <form onSubmit={createAlert}>
          <div className="fields">
            <div className="field">
              <label htmlFor="origin">Origen</label>
              <input
                id="origin"
                name="origin"
                className="iata"
                placeholder="MDE"
                maxLength={3}
                pattern="[A-Za-z]{3}"
                title="Código de aeropuerto de 3 letras"
                autoCapitalize="characters"
                required
              />
            </div>
            <div className="field">
              <label htmlFor="destination">Destino</label>
              <input
                id="destination"
                name="destination"
                className="iata"
                placeholder="MAD"
                maxLength={3}
                pattern="[A-Za-z]{3}"
                title="Código de aeropuerto de 3 letras"
                autoCapitalize="characters"
                required
              />
            </div>
            <div className="field wide">
              <label htmlFor="trip">Tipo de viaje</label>
              <select
                id="trip"
                value={roundTrip ? "round" : "oneway"}
                onChange={(e) => setRoundTrip(e.target.value === "round")}
              >
                <option value="round">Ida y vuelta</option>
                <option value="oneway">Solo ida</option>
              </select>
            </div>
            <div className={roundTrip ? "field" : "field wide"}>
              <label htmlFor="outbound_date">Salida</label>
              <input id="outbound_date" name="outbound_date" type="date" min={today} required />
            </div>
            {roundTrip && (
              <div className="field">
                <label htmlFor="return_date">Regreso</label>
                <input id="return_date" name="return_date" type="date" min={today} required />
              </div>
            )}
            <div className="field">
              <label htmlFor="target_price">Precio tope</label>
              <input
                id="target_price"
                name="target_price"
                type="number"
                min={1}
                step="any"
                inputMode="decimal"
                placeholder="2500000"
                required
              />
            </div>
            <div className="field">
              <label htmlFor="currency">Moneda</label>
              <select id="currency" name="currency" defaultValue="COP">
                {CURRENCIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="field wide">
              <label htmlFor="email">Correo para el aviso</label>
              <input id="email" name="email" type="email" placeholder="tu@correo.com" />
              {config && !config.email && (
                <small>El correo aún no está activo: falta RESEND_API_KEY.</small>
              )}
            </div>
            <div className="field wide">
              <label htmlFor="telegram_chat_id">Chat ID de Telegram</label>
              <input
                id="telegram_chat_id"
                name="telegram_chat_id"
                inputMode="numeric"
                placeholder="123456789"
              />
              <small>
                {config && !config.telegram
                  ? "Telegram aún no está activo: falta TELEGRAM_BOT_TOKEN."
                  : "Llena el correo, el chat de Telegram o ambos."}
              </small>
            </div>
          </div>
          {formError && (
            <p className="notice error" style={{ marginTop: "1rem" }}>
              {formError}
            </p>
          )}
          <button
            className="btn primary"
            style={{ marginTop: "1.25rem", width: "100%" }}
            disabled={saving}
          >
            {saving ? "Guardando…" : "Crear alerta"}
          </button>
        </form>
      </section>

      <section aria-labelledby="my-alerts">
        <h2 id="my-alerts">
          {alerts.length === 0
            ? "Tus alertas"
            : `${active} ${active === 1 ? "alerta activa" : "alertas activas"}`}
        </h2>

        {config && !config.flights && (
          <p className="notice error">
            Falta SERPAPI_KEY en Vercel: sin ella no se pueden consultar precios.
          </p>
        )}
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}

        {alerts.length === 0 ? (
          <div className="empty-state">
            <strong>Todavía no vigilas ninguna ruta.</strong>
            Crea la primera con el formulario. Los precios se revisan una vez al día, a las 7:00
            a. m. hora de Colombia.
          </div>
        ) : (
          <ul className="alerts">
            {alerts.map((alert) => {
              const hit = alert.last_price !== null && alert.last_price <= alert.target_price;
              const busy = busyId === alert.id;
              return (
                <li
                  key={alert.id}
                  className={`alert${hit ? " hit" : ""}${alert.active ? "" : " paused"}`}
                >
                  <div className="alert-main">
                    <div>
                      <div className="route">
                        <span>{alert.origin}</span>
                        <span className="route-line" aria-hidden="true" />
                        <svg
                          width="26"
                          height="26"
                          viewBox="0 0 24 24"
                          fill="currentColor"
                          aria-hidden="true"
                          style={{ transform: "rotate(90deg)" }}
                        >
                          <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
                        </svg>
                        <span className="route-line" aria-hidden="true" />
                        <span>{alert.destination}</span>
                      </div>
                      <p className="dates">
                        {alert.return_date
                          ? `Ida ${formatDate(alert.outbound_date)}, regreso ${formatDate(alert.return_date)}`
                          : `Solo ida, ${formatDate(alert.outbound_date)}`}
                        {!alert.active && " (en pausa)"}
                      </p>
                    </div>
                    <div className="prices">
                      {alert.last_price !== null ? (
                        <p className="now">{formatPrice(alert.last_price, alert.currency)}</p>
                      ) : (
                        <p className="now empty">Sin precio todavía</p>
                      )}
                      <p className="target">
                        Tu tope: {formatPrice(alert.target_price, alert.currency)}
                      </p>
                      {alert.last_price !== null && (
                        <span className={`verdict${hit ? " hit" : ""}`}>
                          {hit
                            ? "Ya está en tu tope o por debajo"
                            : `Le faltan ${formatPrice(alert.last_price - alert.target_price, alert.currency)} por bajar`}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="alert-foot">
                    <span>
                      {alert.last_checked_at
                        ? `Revisado ${formatChecked(alert.last_checked_at)}`
                        : "Aún sin revisar"}
                      {". "}
                      <a href={googleFlightsUrl(alert)} target="_blank" rel="noopener noreferrer">
                        Ver en Google Flights
                      </a>
                    </span>
                    <span className="actions">
                      <button
                        className="btn quiet"
                        disabled={busy || !config?.flights}
                        onClick={() => act(alert, { method: "POST" })}
                      >
                        {busy ? "Consultando…" : "Consultar precio ahora"}
                      </button>
                      <button
                        className="btn quiet"
                        disabled={busy}
                        onClick={() =>
                          act(alert, {
                            method: "PATCH",
                            body: JSON.stringify({ active: !alert.active }),
                          })
                        }
                      >
                        {alert.active ? "Pausar" : "Reanudar"}
                      </button>
                      <button
                        className="btn quiet danger"
                        disabled={busy}
                        onClick={() => act(alert, { method: "DELETE" })}
                      >
                        Eliminar
                      </button>
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
