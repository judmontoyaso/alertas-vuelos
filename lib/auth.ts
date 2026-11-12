import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

// Devuelve una respuesta de error si la peticion no trae el codigo de acceso; null si puede seguir.
export function requireAccess(request: Request): NextResponse | null {
  const expected = process.env.ACCESS_TOKEN;
  if (!expected) {
    if (process.env.NODE_ENV !== "production") return null;
    return NextResponse.json(
      { error: "Falta la variable ACCESS_TOKEN en Vercel." },
      { status: 503 },
    );
  }
  const given = request.headers.get("x-access-code") ?? "";
  if (!safeEqual(given, expected)) {
    return NextResponse.json({ error: "Código de acceso incorrecto." }, { status: 401 });
  }
  return null;
}

export function isCronAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return safeEqual(request.headers.get("authorization") ?? "", `Bearer ${secret}`);
}
