import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  const appRole = session.user.appRole;
  if (appRole !== "admin" && appRole !== "manager") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { id: splitId } = await params;
  const body = await req.json().catch(() => ({}));
  const { characterId, itemId, bossId, difficulty, upgradePct, upgradeAbsolute, metricType, specId } = body as {
    characterId?: string;
    itemId?: number;
    bossId?: string;
    difficulty?: string | null;
    upgradePct?: number | null;
    upgradeAbsolute?: number | null;
    metricType?: string | null;
    specId?: number | null;
  };

  if (!characterId || !itemId || !bossId) {
    return NextResponse.json({ error: "Falta personaje, ítem o jefe" }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const { data: appUser } = await supabase
    .from("app_users")
    .select("id")
    .eq("discord_id", session.user.discordId)
    .maybeSingle();

  const { data, error } = await supabase
    .from("wishlist_split_assignments")
    .insert({
      split_id: splitId,
      character_id: characterId,
      item_id: itemId,
      boss_id: bossId,
      difficulty: difficulty ?? null,
      upgrade_pct: upgradePct ?? null,
      upgrade_absolute: upgradeAbsolute ?? null,
      metric_type: metricType ?? null,
      spec_id: specId ?? null,
      added_by: appUser?.id ?? null,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      const { data: existing, error: existingError } = await supabase
        .from("wishlist_split_assignments")
        .select("id")
        .eq("split_id", splitId)
        .eq("character_id", characterId)
        .eq("item_id", itemId)
        .maybeSingle();
      if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });
      return NextResponse.json({ assignmentId: existing?.id ?? null, alreadyAssigned: true });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ assignmentId: data.id, alreadyAssigned: false });
}
