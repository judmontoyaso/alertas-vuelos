import { NextResponse } from "next/server";
import { searchPlaces } from "@/lib/airports";

// Buscador de aeropuertos y ciudades por nombre o codigo IATA.
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q") ?? "";
  return NextResponse.json({ places: searchPlaces(q) });
}
