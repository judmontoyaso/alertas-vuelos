import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/auth";
import { checkAlerts } from "@/lib/check";
import { getDb, TABLE } from "@/lib/db";
import type { Alert } from "@/lib/types";

export const maxDuration = 300;

// Lo ejecuta el Cron Job de Vercel (vercel.json) con Authorization: Bearer CRON_SECRET.
export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return new NextResponse("No autorizado", { status: 401 });
  }
  const db = getDb();
  if (!db) return NextResponse.json({ error: "Falta configurar Supabase." }, { status: 503 });

  try {
    const { data, error } = await db.from(TABLE).select("*").eq("active", true);
    if (error) throw new Error(error.message);
    const results = await checkAlerts((data ?? []) as Alert[]);
    return NextResponse.json({
      success: true,
      checked: results.length,
      notified: results.filter((r) => r.notified).length,
      errors: results.filter((r) => r.error).length,
    });
  } catch (error) {
    console.error("Error revisando vuelos:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
