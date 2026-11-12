import { addDays, daysBetween, MAX_OPTIONS, todayIso, type FlightOption, type Search } from "./types";

// Satena no publica precios en Google Flights. Su buscador (motor de reservas de KIU) consulta
// este calendario de tarifas, que responde sin sesion ni clave. No es una API oficial para
// terceros: puede cambiar sin aviso, asi que cualquier fallo se trata como "sin precios".
// Solo responde en pesos colombianos y con un aeropuerto por lado.

export const SATENA = "Satena";
export const SATENA_URL = "https://www.satena.com/";

const RATES_URL = "https://landings-persistence-prod.kiusys.net/rates";
const AIRLINE_ID = "1NWNYOD3I2QH"; // identificador de Satena en KIU, tomado de su buscador
const TIMEOUT_MS = 10_000;
const DEAL_MONTHS = 6;
// "Cualquier fecha": dias de viaje que cuentan como fin de semana, una semana y dos semanas.
const DEAL_TRIP_DAYS: Record<number, [number, number]> = { 1: [2, 4], 2: [6, 8], 3: [13, 15] };

type Rate = { date?: string; fare?: number | null; rate_date_inbound?: string | null };
type Fare = { out: string; ret: string | null; price: number };

async function rates(origin: string, destination: string, type: "OW" | "RT"): Promise<Fare[]> {
  const query = new URLSearchParams({
    airline_id: AIRLINE_ID, origin, destination, currency: "COP", flight_type: type,
  });
  const res = await fetch(`${RATES_URL}?${query}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (res.status === 404) return []; // Satena no vuela esa ruta
  if (!res.ok) throw new Error(`El calendario de Satena respondió ${res.status}`);
  const data: unknown = await res.json();
  if (!Array.isArray(data)) return [];
  return (data as Rate[]).flatMap((r) => {
    const out = r.date?.slice(0, 10);
    const ret = r.rate_date_inbound?.slice(0, 10) ?? null;
    if (!out || typeof r.fare !== "number" || r.fare <= 0) return [];
    if (type === "RT" && !ret) return [];
    return [{ out, ret: type === "RT" ? ret : null, price: r.fare }];
  });
}

// Todas las combinaciones de aeropuertos de una ciudad con varios (EOH y MDE, por ejemplo).
async function allPairs(origins: string[], destinations: string[], type: "OW" | "RT") {
  const lists = await Promise.all(
    origins.flatMap((o) => destinations.map((d) => rates(o, d, type))),
  );
  return lists.flat();
}

type Window = {
  outFrom: string;
  outTo: string;
  // Solo ida y vuelta: el regreso vale si cae en el rango o si el viaje dura lo pedido.
  validReturn?: (out: string, ret: string) => boolean;
};

function windowFor(s: Search): Window {
  const today = todayIso();
  if (s.mode === "dates") {
    return {
      outFrom: s.out_from! > today ? s.out_from! : today,
      outTo: s.out_to!,
      validReturn: (_out, ret) => ret >= s.ret_from! && ret <= s.ret_to!,
    };
  }
  let outFrom = today;
  let outTo = addDays(today, DEAL_MONTHS * 30);
  if (s.month !== 0) {
    const now = new Date();
    const year = now.getUTCFullYear() + (s.month < now.getUTCMonth() + 1 ? 1 : 0);
    const first = `${year}-${String(s.month).padStart(2, "0")}-01`;
    outFrom = first > today ? first : today;
    outTo = new Date(Date.UTC(year, s.month, 0)).toISOString().slice(0, 10);
  }
  const [min, max] = DEAL_TRIP_DAYS[s.trip_length] ?? DEAL_TRIP_DAYS[2];
  return {
    outFrom,
    outTo,
    validReturn: (out, ret) => {
      const days = daysBetween(out, ret);
      // Un fin de semana sale de jueves a sabado.
      const weekday = new Date(`${out}T00:00:00Z`).getUTCDay();
      return days >= min && days <= max && (s.trip_length !== 1 || weekday >= 4);
    },
  };
}

// Las opciones mas baratas de Satena para una busqueda, o [] si no vuela la ruta o no hay tarifas.
export async function findSatena(s: Search): Promise<FlightOption[]> {
  if (s.currency !== "COP") return [];
  const origins = s.origin.split(",");
  const destinations = s.destination.split(",");
  const w = windowFor(s);
  const inWindow = (f: Fare) => f.out >= w.outFrom && f.out <= w.outTo;

  let fares: Fare[];
  if (!s.round_trip) {
    fares = (await allPairs(origins, destinations, "OW")).filter(inWindow);
  } else {
    const valid = (f: Fare) => inWindow(f) && f.ret !== null && w.validReturn!(f.out, f.ret);
    // Parejas de fechas que Satena ya cotizo como ida y vuelta.
    const quoted = (await allPairs(origins, destinations, "RT")).filter(valid);
    const known = new Set(quoted.map((f) => `${f.out}|${f.ret}`));
    // Son pocas; el resto se arma sumando la tarifa de ida y la de regreso de cada dia.
    const [going, back] = await Promise.all([
      allPairs(origins, destinations, "OW"),
      allPairs(destinations, origins, "OW"),
    ]);
    const cheapest = (list: Fare[]) => {
      const byDay = new Map<string, number>();
      for (const f of list) byDay.set(f.out, Math.min(f.price, byDay.get(f.out) ?? Infinity));
      return byDay;
    };
    const backByDay = cheapest(back);
    const combined: Fare[] = [];
    for (const [out, price] of cheapest(going.filter(inWindow))) {
      for (const [ret, retPrice] of backByDay) {
        const fare = { out, ret, price: price + retPrice };
        if (ret >= out && !known.has(`${out}|${ret}`) && valid(fare)) combined.push(fare);
      }
    }
    fares = [...quoted, ...combined];
  }

  const seen = new Set<string>();
  return fares
    .sort((a, b) => a.price - b.price || a.out.localeCompare(b.out))
    .filter((f) => !seen.has(`${f.out}|${f.ret}`) && seen.add(`${f.out}|${f.ret}`))
    .slice(0, MAX_OPTIONS)
    .map((f) => ({ ...f, airline: SATENA }));
}
