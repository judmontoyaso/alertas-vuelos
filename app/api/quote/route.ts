import { NextResponse } from "next/server";
import { requireAccess } from "@/lib/auth";
import { getQuote, validateSearch } from "@/lib/search";

export const maxDuration = 60;

// Precio de hoy y topes sugeridos para una busqueda, antes de crear la alerta (2 busquedas de SerpApi).
export async function POST(request: Request) {
  const denied = requireAccess(request);
  if (denied) return denied;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
  }
  const validated = validateSearch(body);
  if ("error" in validated) return NextResponse.json({ error: validated.error }, { status: 400 });

  try {
    return NextResponse.json({ quote: await getQuote(validated.search) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error interno";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
