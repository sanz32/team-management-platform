import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { closeWeek, reopenWeek } from "@/lib/weekly-earnings";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const appRole = session.user.appRole;
  if (appRole !== "admin" && appRole !== "manager") {
    return NextResponse.json(
      { error: "Solo el líder o los managers pueden cerrar una semana" },
      { status: 403 }
    );
  }

  const discordId = session.user.discordId;
  const body = await req.json().catch(() => ({}));
  const { weekStart, weekEnd } = body as { weekStart?: string; weekEnd?: string };

  if (!weekStart || !weekEnd) {
    return NextResponse.json({ error: "Faltan weekStart y weekEnd" }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();

  const { data: appUser } = await supabase
    .from("app_users")
    .select("id")
    .eq("discord_id", discordId)
    .single();

  if (!appUser) {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  }

  try {
    const { closed, skipped } = await closeWeek(supabase, weekStart, weekEnd, appUser.id);
    return NextResponse.json({ closed, skipped });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error cerrando la semana";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const appRole = session.user.appRole;
  if (appRole !== "admin" && appRole !== "manager") {
    return NextResponse.json(
      { error: "Solo el líder o los managers pueden deshacer un cierre de semana" },
      { status: 403 }
    );
  }

  const weekStart = req.nextUrl.searchParams.get("weekStart");
  if (!weekStart) {
    return NextResponse.json({ error: "Falta weekStart" }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();

  try {
    const { deleted } = await reopenWeek(supabase, weekStart);
    return NextResponse.json({ deleted });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error deshaciendo el cierre";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
