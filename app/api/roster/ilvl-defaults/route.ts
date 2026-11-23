import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getRosterIlvlDefaults, RaidDifficulty } from "@/lib/roster-ilvl-defaults";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const appRole = session.user.appRole;
  if (appRole !== "admin" && appRole !== "manager" && appRole !== "guest") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const supabase = createServerSupabaseClient();
  const defaults = await getRosterIlvlDefaults(supabase);
  return NextResponse.json(defaults);
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const appRole = session.user.appRole;
  if (appRole !== "admin" && appRole !== "manager") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const discordId = session.user.discordId;
  const body = await req.json().catch(() => ({}));
  const { heroic, mythic } = body as { heroic?: number; mythic?: number };

  const entries = (
    [
      ["heroic", heroic],
      ["mythic", mythic],
    ] as [RaidDifficulty, number | undefined][]
  ).filter((entry): entry is [RaidDifficulty, number] => entry[1] !== undefined);

  if (entries.length === 0) {
    return NextResponse.json({ error: "No hay valores para guardar" }, { status: 400 });
  }

  for (const [, value] of entries) {
    if (!Number.isFinite(value) || value < 0) {
      return NextResponse.json({ error: "El ilvl mínimo debe ser un número mayor o igual a 0" }, { status: 400 });
    }
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

  const toUpsert = entries.map(([difficulty, value]) => ({
    difficulty,
    min_ilvl: Math.round(value),
    updated_by: appUser.id,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase.from("roster_ilvl_defaults").upsert(toUpsert, { onConflict: "difficulty" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const updated = await getRosterIlvlDefaults(supabase);
  return NextResponse.json(updated);
}
