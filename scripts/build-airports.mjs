// Genera lib/airports.json a partir de airports.csv de OurAirports (dominio publico):
//   node scripts/build-airports.mjs ruta/a/airports.csv
import fs from "node:fs";

function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (ch !== "\r") field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const [header, ...rows] = parseCsv(fs.readFileSync(process.argv[2], "utf8"));
const col = Object.fromEntries(header.map((name, i) => [name, i]));
const RANK = { large_airport: 0, medium_airport: 1, small_airport: 2 };

const airports = rows
  .filter((r) => r[col.type] in RANK && r[col.scheduled_service] === "yes" && /^[A-Z]{3}$/.test(r[col.iata_code]))
  .map((r) => ({
    c: r[col.iata_code],
    n: r[col.name],
    m: r[col.municipality],
    k: r[col.iso_country],
    t: RANK[r[col.type]],
    w: r[col.keywords] || undefined,
  }))
  .sort((a, b) => a.t - b.t || a.c.localeCompare(b.c));

const unique = [...new Map(airports.map((a) => [a.c, a])).values()];
fs.writeFileSync("lib/airports.json", JSON.stringify(unique));
console.log(`${unique.length} aeropuertos`);
