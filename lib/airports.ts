import data from "./airports.json";

// c = codigo IATA, n = nombre, m = ciudad, k = pais ISO, t = tamano (0 grande), w = palabras clave
type Airport = { c: string; n: string; m: string; k: string; t: number; w?: string };

export type Place = {
  codes: string; // uno o varios codigos IATA separados por coma
  label: string; // "Medellín (MDE)"
  detail: string; // "Jose Maria Córdova International Airport, Colombia"
};

const airports = data as Airport[];
const byCode = new Map(airports.map((a) => [a.c, a]));
const MAX_CITY_AIRPORTS = 4;

const countryNames = new Intl.DisplayNames(["es"], { type: "region" });
const country = (iso: string) => countryNames.of(iso) ?? iso;

const normalize = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Ciudades con mas de un aeropuerto: se ofrecen como "todos los aeropuertos".
const cities = new Map<string, Airport[]>();
for (const a of airports) {
  if (!a.m) continue;
  const key = `${normalize(a.m)}|${a.k}`;
  cities.set(key, [...(cities.get(key) ?? []), a]);
}

const index = airports.map((a) => ({
  airport: a,
  city: normalize(a.m),
  text: normalize(`${a.n} ${a.w ?? ""}`),
}));

function airportPlace(a: Airport): Place {
  return { codes: a.c, label: `${a.m || a.n} (${a.c})`, detail: `${a.n}, ${country(a.k)}` };
}

export function isValidCodes(codes: string) {
  const list = codes.split(",");
  return (
    list.length >= 1 &&
    list.length <= MAX_CITY_AIRPORTS &&
    new Set(list).size === list.length &&
    list.every((c) => byCode.has(c))
  );
}

// Etiqueta calculada en el servidor a partir de los codigos, sin confiar en el cliente.
export function labelFor(codes: string) {
  const list = codes.split(",");
  const first = byCode.get(list[0]);
  return `${first?.m || first?.n || list[0]} (${list.join(", ")})`;
}

// El catalogo trae las ciudades en ingles o en su idioma local; estos son los nombres en español
// que no se parecen lo suficiente para encontrarlos sin ayuda.
const SPANISH_NAMES: Record<string, string> = {
  "nueva york": "new york", londres: "london", roma: "rome", lisboa: "lisbon", moscu: "moscow",
  estambul: "istanbul", "ciudad de mexico": "mexico city", pekin: "beijing", tokio: "tokyo",
  atenas: "athens", viena: "vienna", praga: "prague", bruselas: "brussels", ginebra: "geneva",
  estocolmo: "stockholm", copenhague: "copenhagen", varsovia: "warsaw", florencia: "florence",
  venecia: "venice", napoles: "naples", marsella: "marseille", niza: "nice", burdeos: "bordeaux",
  colonia: "cologne", francfort: "frankfurt", hamburgo: "hamburg", edimburgo: "edinburgh",
  "el cairo": "cairo", "nueva delhi": "new delhi", seul: "seoul", singapur: "singapore",
  "la habana": "havana", "ciudad de panama": "panama city", filadelfia: "philadelphia",
  "nueva orleans": "new orleans", jerusalen: "jerusalem", tunez: "tunis", argel: "algiers",
  bucarest: "bucharest", belgrado: "belgrade", cracovia: "krakow", turin: "turin",
  bolonia: "bologna", genova: "genoa", "ciudad del cabo": "cape town", johannesburgo: "johannesburg",
};

function scoreEntry(entry: (typeof index)[number], q: string) {
  if (entry.airport.c.toLowerCase() === q) return 0;
  if (entry.city.startsWith(q)) return 1;
  if (entry.text.split(/[\s,]+/).some((word) => word.startsWith(q))) return 2;
  if (q.length >= 3 && (entry.city.includes(q) || entry.text.includes(q))) return 3;
  return -1;
}

export function searchPlaces(query: string, limit = 8): Place[] {
  const q = normalize(query.trim());
  if (q.length < 2) return [];
  const queries = [q];
  if (q.length >= 3) {
    for (const [spanish, english] of Object.entries(SPANISH_NAMES)) {
      if (spanish.startsWith(q)) queries.push(english);
    }
  }

  const scored: { score: number; airport: Airport }[] = [];
  for (const entry of index) {
    const scores = queries.map((query) => scoreEntry(entry, query)).filter((s) => s >= 0);
    if (scores.length) scored.push({ score: Math.min(...scores), airport: entry.airport });
  }
  scored.sort((a, b) => a.score - b.score || a.airport.t - b.airport.t);

  const places: Place[] = [];
  const citiesAdded = new Set<string>();
  for (const { airport } of scored) {
    if (places.length >= limit) break;
    const key = `${normalize(airport.m)}|${airport.k}`;
    const group = cities.get(key) ?? [];
    if (group.length > 1 && !citiesAdded.has(key)) {
      citiesAdded.add(key);
      const codes = group.slice(0, MAX_CITY_AIRPORTS).map((a) => a.c);
      places.push({
        codes: codes.join(","),
        label: `${airport.m} (${codes.join(", ")})`,
        detail: `Todos los aeropuertos, ${country(airport.k)}`,
      });
    }
    places.push(airportPlace(airport));
  }
  return places.slice(0, limit);
}
