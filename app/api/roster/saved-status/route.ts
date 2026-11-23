import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getCurrentLockoutWeek } from "@/lib/wow-reset";
import { getCurrentRaidCatalog } from "@/lib/raid-catalog";
import { fetchAllBossKills } from "@/lib/boss-kills";
import { getFriendUserIds } from "@/lib/friend-members";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const appRole = session.user.appRole;
  if (appRole !== "admin" && appRole !== "manager") {
    return NextResponse.json(
      { error: "Solo el líder o los managers pueden editar un roster guardado" },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const { raidKeys, difficulty } = body as { raidKeys?: string[]; difficulty?: string };

  if (!raidKeys?.length || !difficulty) {
    return NextResponse.json({ error: "Faltan raidKeys y difficulty" }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const { raids } = await getCurrentRaidCatalog(supabase);

  for (const rk of raidKeys) {
    if (!raids.some((r) => r.key === rk)) {
      return NextResponse.json({ error: "Raid inválida" }, { status: 400 });
    }
  }

  const [{ data: allCharacters, error }, friendUserIds] = await Promise.all([
    supabase.from("characters").select("id, region, user_id"),
    getFriendUserIds(supabase),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const characters = (allCharacters ?? []).filter((c) => !friendUserIds.has(c.user_id));

  const saved: Record<string, boolean> = {};

  if (characters.length > 0) {
    const regionById = new Map(characters.map((c) => [c.id, c.region as string]));
    const orFilter = raidKeys.map((rk) => `boss_key.like.${rk}-${difficulty}-%`).join(",");

    const kills = await fetchAllBossKills(
      supabase,
      characters.map((c) => c.id),
      orFilter
    );

    for (const k of kills) {
      const region = regionById.get(k.character_id);
      if (!region) continue;
      if (k.lockout_week === getCurrentLockoutWeek(region)) {
        saved[k.character_id] = true;
      }
    }
  }

  return NextResponse.json({ saved });
}
