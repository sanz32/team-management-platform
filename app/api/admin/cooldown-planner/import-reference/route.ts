import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { extractReportCode, WclNotFoundError, WclRateLimitError, WclReauthRequiredError } from "@/lib/wcl";
import {
  importReferenceLog,
  FightNotFoundError,
  BossNotSyncedError,
} from "@/lib/cooldown-planner/reference-import";

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
  const fightId = (body as { fightId?: number }).fightId;

  if (!url || typeof url !== "string") {
    return NextResponse.json({ error: "Falta el link del reporte" }, { status: 400 });
  }
  if (typeof fightId !== "number") {
    return NextResponse.json({ error: "Falta elegir el pull a importar" }, { status: 400 });
  }

  const reportCode = extractReportCode(url);
  if (!reportCode) {
    return NextResponse.json({ error: "Ese link no parece un reporte válido de Warcraft Logs" }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const { data: appUser } = await supabase
    .from("app_users")
    .select("id")
    .eq("discord_id", session.user.discordId)
    .maybeSingle();

  try {
    const timeline = await importReferenceLog(supabase, appUser?.id ?? null, reportCode, fightId);
    return NextResponse.json(timeline);
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
    if (err instanceof FightNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    if (err instanceof BossNotSyncedError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("Error importando log de referencia:", err);
    const message = err instanceof Error ? err.message : "Error desconocido importando el log de referencia.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
