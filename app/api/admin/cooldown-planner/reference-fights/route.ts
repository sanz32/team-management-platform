import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  extractReportCode,
  getReportOverview,
  WclNotFoundError,
  WclRateLimitError,
  WclReauthRequiredError,
} from "@/lib/wcl";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  if (session.user.appRole !== "admin" && session.user.appRole !== "manager") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const url = (body as { url?: string }).url;
  if (!url || typeof url !== "string") {
    return NextResponse.json({ error: "Falta el link del reporte" }, { status: 400 });
  }

  const reportCode = extractReportCode(url);
  if (!reportCode) {
    return NextResponse.json({ error: "Ese link no parece un reporte válido de Warcraft Logs" }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();

  try {
    const overview = await getReportOverview(supabase, reportCode);
    return NextResponse.json({ report: overview });
  } catch (err) {
    if (err instanceof WclNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    if (err instanceof WclRateLimitError) {
      return NextResponse.json({ error: err.message }, { status: 429 });
    }
    if (err instanceof WclReauthRequiredError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    const message = err instanceof Error ? err.message : "Error consultando Warcraft Logs";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
