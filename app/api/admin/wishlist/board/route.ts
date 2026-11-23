import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { isSimStale, armorCategory } from "@/lib/wishlist";
import { getFriendUserIds } from "@/lib/friend-members";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  if (session.user.appRole !== "admin" && session.user.appRole !== "manager") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const supabase = createServerSupabaseClient();

  const { data: season } = await supabase
    .from("raid_seasons")
    .select("id, name")
    .eq("is_current", true)
    .maybeSingle();

  if (!season) {
    return NextResponse.json({ season: null, upgrades: [] });
  }

  const { data, error } = await supabase
    .from("character_wishlist_upgrades")
    .select(
      "id, ilvl, difficulty, upgrade_pct, upgrade_absolute, priority, is_tier_piece, source, item_id, " +
        "raid_bosses!inner(id, name, order_index, image_url, season_id), " +
        "wishlist_items(name, icon_url, slot, quality, item_class, item_subclass), " +
        "characters(id, name, class, ilvl, realm_name, realm_slug, user_id), " +
        "character_sims(provider, metric_type, imported_at, sim_url, baseline_output, wow_specializations(spec_id, spec_name, role, icon_url))"
    )
    .eq("raid_bosses.season_id", season.id)
    .gt("upgrade_pct", 0);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  interface Row {
    id: string;
    ilvl: number;
    difficulty: string | null;
    upgrade_pct: number;
    upgrade_absolute: number | null;
    priority: number | null;
    is_tier_piece: boolean;
    source: string;
    item_id: number;
    raid_bosses: { id: string; name: string; order_index: number; image_url: string | null } | null;
    wishlist_items: {
      name: string | null;
      icon_url: string | null;
      slot: string | null;
      quality: string | null;
      item_class: string | null;
      item_subclass: string | null;
    } | null;
    characters: {
      id: string;
      name: string;
      class: string | null;
      ilvl: number | null;
      realm_name: string | null;
      realm_slug: string;
      user_id: string;
    } | null;
    character_sims: {
      provider: string;
      metric_type: string;
      imported_at: string;
      sim_url: string;
      baseline_output: number | null;
      wow_specializations: { spec_id: number; spec_name: string; role: string; icon_url: string | null } | null;
    } | null;
  }

  const friendUserIds = await getFriendUserIds(supabase);

  const rows = ((data ?? []) as unknown as Row[]).filter(
    (u) => !u.characters || !friendUserIds.has(u.characters.user_id)
  );

  const upgrades = rows.map((u) => {
    const spec = u.character_sims?.wow_specializations ?? null;
    return {
      id: u.id,
      bossId: u.raid_bosses?.id ?? "",
      bossName: u.raid_bosses?.name ?? "?",
      bossOrderIndex: u.raid_bosses?.order_index ?? 0,
      bossImageUrl: u.raid_bosses?.image_url ?? null,
      itemId: u.item_id,
      itemName: u.wishlist_items?.name ?? "?",
      itemIconUrl: u.wishlist_items?.icon_url ?? null,
      itemSlot: u.wishlist_items?.slot ?? null,
      itemQuality: u.wishlist_items?.quality ?? null,
      armorCategory: armorCategory(
        u.wishlist_items?.item_class ?? null,
        u.wishlist_items?.item_subclass ?? null,
        u.wishlist_items?.slot ?? null
      ),
      ilvl: u.ilvl,
      difficulty: u.difficulty,
      upgradePct: u.upgrade_pct,
      upgradeAbsolute: u.upgrade_absolute,
      priority: u.priority,
      isTierPiece: u.is_tier_piece,
      source: u.source,
      characterId: u.characters?.id ?? "",
      characterName: u.characters?.name ?? "?",
      characterClass: u.characters?.class ?? null,
      characterIlvl: u.characters?.ilvl ?? null,
      characterRealmName: u.characters?.realm_name ?? null,
      characterRealmSlug: u.characters?.realm_slug ?? null,
      specId: spec?.spec_id ?? null,
      specName: spec?.spec_name ?? null,
      specRole: spec?.role ?? null,
      specIconUrl: spec?.icon_url ?? null,
      provider: u.character_sims?.provider ?? "raidbots",
      metricType: u.character_sims?.metric_type ?? "dps",
      simUrl: u.character_sims?.sim_url ?? null,
      importedAt: u.character_sims?.imported_at ?? null,
      baselineOutput: u.character_sims?.baseline_output ?? null,
      isStale: u.character_sims ? isSimStale(u.character_sims.imported_at) : false,
    };
  });

  return NextResponse.json({ season: { id: season.id, name: season.name }, upgrades });
}
