import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { isSimStaleForCharacter } from "@/lib/wishlist";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { id } = await params;
  const canManageAny = session.user.appRole === "admin" || session.user.appRole === "manager";
  const supabase = createServerSupabaseClient();

  const { data: appUser } = await supabase
    .from("app_users")
    .select("id")
    .eq("discord_id", session.user.discordId)
    .maybeSingle();
  if (!appUser) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });

  const { data: character, error: charError } = await supabase
    .from("characters")
    .select("id, user_id, name, class, role, active_spec")
    .eq("id", id)
    .maybeSingle();
  if (charError) return NextResponse.json({ error: charError.message }, { status: 500 });
  if (!character) return NextResponse.json({ error: "Personaje no encontrado" }, { status: 404 });

  const isOwner = character.user_id === appUser.id;
  if (!isOwner && !canManageAny) {
    return NextResponse.json({ error: "No tienes permiso para ver este personaje" }, { status: 403 });
  }

  const { data: season } = await supabase
    .from("raid_seasons")
    .select("id")
    .eq("is_current", true)
    .maybeSingle();

  const { data: sims, error: simsError } = await supabase
    .from("character_sims")
    .select(
      "id, provider, metric_type, sim_url, spec, fight_style, imported_at, baseline_output, wow_specializations(spec_id, spec_name, role, icon_url), character_wishlist_upgrades(id, ilvl, difficulty, upgrade_pct, upgrade_absolute, priority, is_tier_piece, source, boss_id, item_id, raid_bosses(id, name, order_index, image_url, season_id), wishlist_items(name, icon_url, slot, quality))"
    )
    .eq("character_id", id);

  if (simsError) return NextResponse.json({ error: simsError.message }, { status: 500 });

  const result = (sims ?? []).map((sim) => {
    interface UpgradeRow {
      id: string;
      ilvl: number;
      difficulty: string | null;
      upgrade_pct: number;
      upgrade_absolute: number | null;
      priority: number | null;
      is_tier_piece: boolean;
      source: string;
      boss_id: string;
      item_id: number;
      raid_bosses: { id: string; name: string; order_index: number; image_url: string | null; season_id: string } | null;
      wishlist_items: { name: string | null; icon_url: string | null; slot: string | null; quality: string | null } | null;
    }
    const upgrades = ((sim.character_wishlist_upgrades ?? []) as unknown as UpgradeRow[]).filter(
      (u) => season && u.raid_bosses?.season_id === season.id
    );

    const specInfo = sim.wow_specializations as unknown as
      | { spec_id: number; spec_name: string; role: string; icon_url: string | null }
      | null;

    return {
      id: sim.id,
      provider: sim.provider,
      metricType: sim.metric_type,
      simUrl: sim.sim_url,
      spec: specInfo?.spec_name ?? sim.spec,
      specIconUrl: specInfo?.icon_url ?? null,
      specRole: specInfo?.role ?? null,
      fightStyle: sim.fight_style,
      importedAt: sim.imported_at,
      baselineOutput: sim.baseline_output,
      isStale: isSimStaleForCharacter(sim.imported_at, upgrades.length),
      upgrades: upgrades
        .map((u) => ({
          id: u.id,
          bossId: u.boss_id,
          bossName: u.raid_bosses?.name ?? "?",
          bossOrderIndex: u.raid_bosses?.order_index ?? 0,
          bossImageUrl: u.raid_bosses?.image_url ?? null,
          itemId: u.item_id,
          itemName: u.wishlist_items?.name ?? "?",
          itemIconUrl: u.wishlist_items?.icon_url ?? null,
          itemSlot: u.wishlist_items?.slot ?? null,
          itemQuality: u.wishlist_items?.quality ?? null,
          ilvl: u.ilvl,
          difficulty: u.difficulty,
          upgradePct: u.upgrade_pct,
          upgradeAbsolute: u.upgrade_absolute,
          priority: u.priority,
          isTierPiece: u.is_tier_piece,
          source: u.source,
        }))
        .sort((a, b) => a.bossOrderIndex - b.bossOrderIndex || b.upgradePct - a.upgradePct),
    };
  });

  return NextResponse.json({
    character: {
      id: character.id,
      name: character.name,
      class: character.class,
      role: character.role,
      activeSpec: character.active_spec,
    },
    sims: result,
  });
}
