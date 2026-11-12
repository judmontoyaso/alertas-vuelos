"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { Place } from "@/lib/airports";
import {
  addDays,
  CURRENCIES,
  formatPrice,
  todayIso,
  TRIP_LENGTHS,
  tripDurations,
  type Alert,
  type Currency,
  type Mode,
  type Quote,
} from "@/lib/types";
import AirportField from "./airport-field";
import AlertCard, { formatDate, monthName } from "./alert-card";

type Config = { flights: boolean; email: boolean; telegram: boolean };
type View = "loading" | "gate" | "ready" | "setup";

const CODE_KEY = "vuelos-access-code";
const CHECKS_PER_DAY = 3;

function readCode() {
  try {
    return localStorage.getItem(CODE_KEY) ?? "";
  } catch {
    return "";
  }
}

// Los seis meses que cubre "cualquier fecha", empezando por el actual.
function nextMonths() {
  const now = new Date();
  return Array.from({ length: 6 }, (_, i) => ((now.getMonth() + i) % 12) + 1);
}

export default function AlertsApp() {
  const [view, setView] = useState<View>("loading");
  const [code, setCode] = useState("");
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [config, setConfig] = useState<Config | null>(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  // Formulario
  const [mode, setMode] = useState<Mode>("dates");
  const [origin, setOrigin] = useState<Place | null>(null);
  const [destination, setDestination] = useState<Place | null>(null);
  const [roundTrip, setRoundTrip] = useState(true);
  const [outFrom, setOutFrom] = useState("");
  const [outTo, setOutTo] = useState("");
  const [retFrom, setRetFrom] = useState("");
  const [retTo, setRetTo] = useState("");
  const [month, setMonth] = useState(0);
  const [tripLength, setTripLength] = useState(2);
  const [currency, setCurrency] = useState<Currency>("COP");
  const [target, setTarget] = useState("");
  const [email, setEmail] = useState("");
  const [telegram, setTelegram] = useState("");
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [quoting, setQuoting] = useState(false);
  const [quote, setQuote] = useState<{ key: string; data: Quote } | null>(null);
  const [formKey, setFormKey] = useState(0); // reinicia los buscadores de aeropuerto

  const search = {
    mode,
    origin: origin?.codes ?? "",
    destination: destination?.codes ?? "",
    round_trip: roundTrip,
    out_from: outFrom || null,
    out_to: outTo || outFrom || null,
    ret_from: retFrom || null,
    ret_to: retTo || retFrom || null,
    month,
    trip_length: tripLength,
    currency,
  };
  const searchKey = JSON.stringify(search);
  const shownQuote = quote?.key === searchKey ? quote.data : null;
  const durations = mode === "dates" && roundTrip ? tripDurations(search).length : 0;
  const dailySearches = mode === "dates" && roundTrip ? Math.min(CHECKS_PER_DAY, Math.max(1, durations)) : 1;

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

  function missingPlace() {
    if (origin && destination) return false;
    setFormError("Elige el origen y el destino de la lista de aeropuertos.");
    return true;
  }

  async function suggestPrices() {
    if (missingPlace()) return;
    setQuoting(true);
    setFormError("");
    const { res, data } = await api("/api/quote", { method: "POST", body: JSON.stringify(search) });
    setQuoting(false);
    if (!res.ok) {
      setFormError(data.error ?? "No se pudieron consultar los precios.");
      return;
    }
    setQuote({ key: searchKey, data: data.quote });
  }

  async function createAlert(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (missingPlace()) return;
    setSaving(true);
    setFormError("");
    const { res, data } = await api("/api/alerts", {
      method: "POST",
      body: JSON.stringify({
        ...search,
        target_price: target,
        email,
        telegram_chat_id: telegram,
        typical: shownQuote?.typical,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      setFormError(data.error ?? "No se pudo guardar la alerta.");
      return;
    }
    setAlerts((list) => [data.alert, ...list]);
    setOrigin(null);
    setDestination(null);
    setTarget("");
    setQuote(null);
    setFormKey((k) => k + 1);
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
            Agrega las variables en Vercel (Settings, Environment Variables), crea las tablas con{" "}
            <code>supabase/schema.sql</code> y vuelve a desplegar.
          </p>
        </div>
      </main>
    );
  }

  const today = todayIso();
  const active = alerts.filter((a) => a.active).length;

  return (
    <main className="layout">
      <section className="panel form-panel" aria-labelledby="new-alert">
        <h2 id="new-alert">Vigilar una ruta</h2>
        <form onSubmit={createAlert}>
          <div className="modes" role="radiogroup" aria-label="Tipo de alerta">
            {(
              [
                ["dates", "Tengo fechas", "Rangos de ida y de regreso"],
                ["deal", "Cualquier fecha", "Avísame cuando haya oferta"],
              ] as const
            ).map(([value, title, hint]) => (
              <label key={value} className={mode === value ? "mode on" : "mode"}>
                <input
                  type="radio"
                  name="mode"
                  checked={mode === value}
                  onChange={() => setMode(value)}
                />
                <strong>{title}</strong>
                <span>{hint}</span>
              </label>
            ))}
          </div>

          <div className="fields">
            <AirportField
              key={`origin-${formKey}`}
              id="origin"
              label="Origen"
              placeholder="Ciudad, aeropuerto o código"
              value={origin}
              onChange={setOrigin}
            />
            <AirportField
              key={`destination-${formKey}`}
              id="destination"
              label="Destino"
              placeholder="Ciudad, aeropuerto o código"
              value={destination}
              onChange={setDestination}
            />
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

            {mode === "dates" ? (
              <>
                <fieldset className="field wide range">
                  <legend>Puedo salir entre</legend>
                  <input
                    type="date"
                    aria-label="Ida, desde"
                    min={today}
                    value={outFrom}
                    onChange={(e) => setOutFrom(e.target.value)}
                    required
                  />
                  <span>y</span>
                  <input
                    type="date"
                    aria-label="Ida, hasta"
                    min={outFrom || today}
                    max={outFrom ? addDays(outFrom, 31) : undefined}
                    value={outTo}
                    onChange={(e) => setOutTo(e.target.value)}
                  />
                </fieldset>
                {roundTrip && (
                  <fieldset className="field wide range">
                    <legend>Puedo regresar entre</legend>
                    <input
                      type="date"
                      aria-label="Regreso, desde"
                      min={outFrom || today}
                      value={retFrom}
                      onChange={(e) => setRetFrom(e.target.value)}
                      required
                    />
                    <span>y</span>
                    <input
                      type="date"
                      aria-label="Regreso, hasta"
                      min={retFrom || outFrom || today}
                      max={retFrom ? addDays(retFrom, 31) : undefined}
                      value={retTo}
                      onChange={(e) => setRetTo(e.target.value)}
                    />
                    <small>Deja vacía la segunda fecha si solo te sirve un día.</small>
                  </fieldset>
                )}
              </>
            ) : (
              <>
                <div className={roundTrip ? "field" : "field wide"}>
                  <label htmlFor="month">Cuándo</label>
                  <select id="month" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
                    <option value={0}>Próximos 6 meses</option>
                    {nextMonths().map((m) => (
                      <option key={m} value={m}>
                        {monthName(m)}
                      </option>
                    ))}
                  </select>
                </div>
                {roundTrip && (
                  <div className="field">
                    <label htmlFor="trip_length">Duración</label>
                    <select
                      id="trip_length"
                      value={tripLength}
                      onChange={(e) => setTripLength(Number(e.target.value))}
                    >
                      {Object.entries(TRIP_LENGTHS).map(([value, name]) => (
                        <option key={value} value={value}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </>
            )}

            <div className="field">
              <label htmlFor="target_price">Precio tope (opcional)</label>
              <input
                id="target_price"
                type="number"
                min={1}
                step="any"
                inputMode="decimal"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="currency">Moneda</label>
              <select
                id="currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value as Currency)}
              >
                {CURRENCIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="field wide">
              <small>
                Sin tope, te avisamos cuando el precio baje de lo habitual para la ruta según
                Google Flights.
              </small>
              <button
                type="button"
                className="btn"
                disabled={quoting || !config?.flights}
                onClick={suggestPrices}
              >
                {quoting ? "Consultando precios…" : "Ver precio de hoy y sugerir topes"}
              </button>
            </div>

            {shownQuote && (
              <div className="quote wide" aria-live="polite">
                {shownQuote.price === null ? (
                  <p>{shownQuote.message}</p>
                ) : (
                  <>
                    <p>
                      <strong>Hoy: {formatPrice(shownQuote.price, currency)}</strong>
                      {shownQuote.outbound && `, saliendo el ${formatDate(shownQuote.outbound)}`}
                      {shownQuote.return && ` y regresando el ${formatDate(shownQuote.return)}`}
                      {shownQuote.airline && ` con ${shownQuote.airline}`}.
                    </p>
                    {shownQuote.typical && (
                      <p>
                        Lo habitual es entre {formatPrice(shownQuote.typical[0], currency)} y{" "}
                        {formatPrice(shownQuote.typical[1], currency)}
                        {shownQuote.level === "low" && ", así que hoy está barato"}
                        {shownQuote.level === "high" && ", así que hoy está caro"}.
                      </p>
                    )}
                    <ul className="chips">
                      {shownQuote.suggestions.map((s) => (
                        <li key={s.value}>
                          <button
                            type="button"
                            className={Number(target) === s.value ? "chip on" : "chip"}
                            onClick={() => setTarget(String(s.value))}
                          >
                            <strong>{formatPrice(s.value, currency)}</strong>
                            <span>{s.label}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )}

            <div className="field wide">
              <label htmlFor="email">Correo para el aviso</label>
              <input
                id="email"
                type="email"
                placeholder="tu@correo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              {config && !config.email && (
                <small>El correo aún no está activo: falta RESEND_API_KEY.</small>
              )}
            </div>
            <div className="field wide">
              <label htmlFor="telegram_chat_id">Chat ID de Telegram</label>
              <input
                id="telegram_chat_id"
                inputMode="numeric"
                placeholder="123456789"
                value={telegram}
                onChange={(e) => setTelegram(e.target.value)}
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
          <p className="cost">
            {durations > CHECKS_PER_DAY
              ? `Tus rangos dan ${durations} duraciones de viaje distintas. Se revisan ${CHECKS_PER_DAY} por día, rotando, para cuidar las búsquedas de SerpApi.`
              : `Esta alerta gasta ${dailySearches} ${dailySearches === 1 ? "búsqueda" : "búsquedas"} de SerpApi al día.`}
          </p>
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
            {alerts.map((alert) => (
              <AlertCard
                key={alert.id}
                alert={alert}
                busy={busyId === alert.id}
                canCheck={Boolean(config?.flights)}
                onCheck={() => act(alert, { method: "POST" })}
                onToggle={() =>
                  act(alert, { method: "PATCH", body: JSON.stringify({ active: !alert.active }) })
                }
                onDelete={() => act(alert, { method: "DELETE" })}
              />
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
