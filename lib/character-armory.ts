import { createServerSupabaseClient } from "@/lib/supabase-server";
import type { TierInfo, TierPiece, TierSetGroup } from "@/lib/tier-set";
import {
  fetchCharacterEquipment,
  fetchCharacterStatistics,
  fetchCharacterMedia,
  fetchCharacterData,
  fetchItemIcon,
  fetchItemSetInfo,
  fetchMythicKeystoneRating,
  EquippedItem,
  CharacterStats,
  CharacterData,
} from "@/lib/blizzard";

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

export interface CharacterArmorySnapshot {
  equipmentFound: boolean;
  items: EquippedItem[];
  stats: CharacterStats;
  renderUrl: string | null;
  race: string | null;
  gender: string | null;
  updatedAt: string;
}

interface CharacterRef {
  id: string;
  region: string;
  realm_slug: string;
  name: string;
  mythic_plus_rating?: number | null;
}

export const EMPTY_STATS: CharacterStats = {
  found: false,
  strength: null,
  agility: null,
  intellect: null,
  stamina: null,
  critPct: null,
  hastePct: null,
  masteryPct: null,
  versatilityPct: null,
  health: null,
};

export async function resolveItemIcons(
  supabase: SupabaseClient,
  region: string,
  itemIds: number[]
): Promise<Map<number, string | null>> {
  const iconByItemId = new Map<number, string | null>();
  if (itemIds.length === 0) return iconByItemId;

  const { data: cached } = await supabase
    .from("item_icons")
    .select("item_id, icon_url")
    .eq("region", region)
    .in("item_id", itemIds);

  for (const row of cached ?? []) iconByItemId.set(row.item_id, row.icon_url);

  const missingIds = itemIds.filter((id) => !iconByItemId.has(id));
  if (missingIds.length > 0) {
    const fetched = await Promise.all(
      missingIds.map(async (itemId) => ({ itemId, iconUrl: await fetchItemIcon(region, itemId) }))
    );
    for (const { itemId, iconUrl } of fetched) iconByItemId.set(itemId, iconUrl);

    await supabase
      .from("item_icons")
      .upsert(
        fetched.map((f) => ({ item_id: f.itemId, region, icon_url: f.iconUrl })),
        { onConflict: "item_id,region" }
      );
  }

  return iconByItemId;
}

async function resolveIcons(
  supabase: SupabaseClient,
  region: string,
  items: EquippedItem[]
): Promise<EquippedItem[]> {
  const itemIds = Array.from(
    new Set([
      ...items.map((i) => i.itemId).filter((id): id is number => id != null),
      ...items.flatMap((i) => i.gems.map((g) => g.itemId)),
      ...items.flatMap((i) => i.enchants.map((e) => e.sourceItemId).filter((id): id is number => id != null)),
    ])
  );
  if (itemIds.length === 0) return items;

  const iconByItemId = await resolveItemIcons(supabase, region, itemIds);

  return items.map((item) => ({
    ...item,
    iconUrl: item.itemId != null ? iconByItemId.get(item.itemId) ?? null : null,
    gems: item.gems.map((gem) => ({
      ...gem,
      iconUrl: iconByItemId.get(gem.itemId) ?? null,
    })),
    enchants: item.enchants.map((enchant) => ({
      ...enchant,
      iconUrl: enchant.sourceItemId != null ? iconByItemId.get(enchant.sourceItemId) ?? null : null,
    })),
  }));
}

const TIER_SLOT_TYPES = ["HEAD", "SHOULDER", "CHEST", "HANDS", "LEGS"];

const NO_TIER: TierInfo = { tierPieceCount: 0, tierSetName: null, tierSets: [] };

interface SetMember {
  id: number;
  name: string;
}

interface CachedSetInfo {
  setId: number | null;
  setName: string | null;
  members: SetMember[];
}

function parseSetMembers(raw: unknown): SetMember[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) =>
      typeof entry === "number"
        ? { id: entry, name: "" }
        : entry && typeof entry === "object"
          ? { id: Number((entry as SetMember).id), name: (entry as SetMember).name ?? "" }
          : null
    )
    .filter((m): m is SetMember => m != null && Number.isFinite(m.id));
}

async function resolveTierInfo(
  supabase: SupabaseClient,
  region: string,
  items: EquippedItem[]
): Promise<TierInfo> {
  const candidates = items.filter(
    (item) => TIER_SLOT_TYPES.includes(item.slotType) && item.itemId != null
  );
  if (candidates.length === 0) return NO_TIER;

  const candidateIds = Array.from(new Set(candidates.map((item) => item.itemId!)));

  const { data: cached } = await supabase
    .from("item_set_info")
    .select("item_id, set_id, set_name, member_item_ids")
    .eq("region", region)
    .in("item_id", candidateIds);

  const setByItemId = new Map<number, CachedSetInfo>(
    (cached ?? []).map((row) => [
      row.item_id as number,
      {
        setId: row.set_id ?? null,
        setName: row.set_name ?? null,
        members: parseSetMembers(row.member_item_ids),
      },
    ])
  );

  const missingIds = candidateIds.filter((id) => !setByItemId.has(id));
  if (missingIds.length > 0) {
    const fetched = await Promise.all(
      missingIds.map(async (itemId) => ({ itemId, info: await fetchItemSetInfo(region, itemId) }))
    );

    for (const { itemId, info } of fetched) {
      setByItemId.set(itemId, {
        setId: info?.setId ?? null,
        setName: info?.setName ?? null,
        members: info?.members ?? [],
      });
    }

    await supabase.from("item_set_info").upsert(
      fetched.map((f) => ({
        item_id: f.itemId,
        region,
        set_id: f.info?.setId ?? null,
        set_name: f.info?.setName ?? null,
        member_item_ids: f.info?.members ?? null,
      })),
      { onConflict: "item_id,region" }
    );
  }

  const setsById = new Map<number, CachedSetInfo & { setId: number }>();
  for (const item of candidates) {
    const info = setByItemId.get(item.itemId!);
    if (info?.setId != null && info.members.length > 0 && !setsById.has(info.setId)) {
      setsById.set(info.setId, info as CachedSetInfo & { setId: number });
    }
  }
  if (setsById.size === 0) return NO_TIER;

  const equippedById = new Map(
    items.filter((item) => item.itemId != null).map((item) => [item.itemId!, item])
  );
  const allMemberIds = Array.from(setsById.values()).flatMap((set) => set.members.map((m) => m.id));
  const iconByItemId = await resolveItemIcons(supabase, region, allMemberIds);

  const tierSets: TierSetGroup[] = Array.from(setsById.values()).map((set) => {
    const pieces: TierPiece[] = set.members.map((member) => {
      const equipped = equippedById.get(member.id);
      return {
        itemId: member.id,
        name: equipped?.name || member.name || "Pieza de Tier",
        iconUrl: iconByItemId.get(member.id) ?? null,
        slot: equipped?.slot ?? null,
        equipped: equipped != null,
      };
    });
    return {
      setId: set.setId,
      setName: set.setName ?? "Set de Tier",
      count: pieces.filter((piece) => piece.equipped).length,
      pieces,
    };
  });

  tierSets.sort((a, b) => b.count - a.count || a.setName.localeCompare(b.setName));

  return {
    tierPieceCount: tierSets[0].count,
    tierSetName: tierSets[0].setName,
    tierSets,
  };
}

export async function refreshArmorySnapshot(
  supabase: SupabaseClient,
  character: CharacterRef,
  knownProfile?: CharacterData
): Promise<CharacterArmorySnapshot> {
  const needsRatingFallback = !character.mythic_plus_rating;

  const [equipment, stats, media, profile, fallbackRating] = await Promise.all([
    fetchCharacterEquipment(character.region, character.realm_slug, character.name),
    fetchCharacterStatistics(character.region, character.realm_slug, character.name),
    fetchCharacterMedia(character.region, character.realm_slug, character.name),
    knownProfile
      ? Promise.resolve(knownProfile)
      : fetchCharacterData(character.region, character.realm_slug, character.name),
    needsRatingFallback
      ? fetchMythicKeystoneRating(character.region, character.realm_slug, character.name)
      : Promise.resolve(null),
  ]);

  const items = await resolveIcons(supabase, character.region, equipment.items);
  const tier = await resolveTierInfo(supabase, character.region, items);
  const updatedAt = new Date().toISOString();

  const updatePayload: Record<string, unknown> = {
    equipment_snapshot: { found: equipment.found, items },
    stats_snapshot: stats,
    character_render_url: media.renderUrl,
    race: profile.race,
    gender: profile.gender,
    tier_piece_count: tier.tierPieceCount,
    tier_set_name: tier.tierSetName,
    tier_pieces: tier.tierSets,
    snapshot_updated_at: updatedAt,
  };
  if (needsRatingFallback && typeof fallbackRating === "number") {
    updatePayload.mythic_plus_rating = fallbackRating;
  }

  await supabase.from("characters").update(updatePayload).eq("id", character.id);

  return {
    equipmentFound: equipment.found,
    items,
    stats,
    renderUrl: media.renderUrl,
    race: profile.race,
    gender: profile.gender,
    updatedAt,
  };
}

export function readArmorySnapshot(character: {
  equipment_snapshot: { found: boolean; items: EquippedItem[] } | null;
  stats_snapshot: CharacterStats | null;
  character_render_url: string | null;
  race: string | null;
  gender: string | null;
  snapshot_updated_at: string | null;
}): CharacterArmorySnapshot | null {
  if (!character.snapshot_updated_at) return null;

  return {
    equipmentFound: character.equipment_snapshot?.found ?? false,
    items: (character.equipment_snapshot?.items ?? []).map((item) => ({
      ...item,
      gems: item.gems ?? [],
      enchants: item.enchants ?? [],
    })),
    stats: character.stats_snapshot ?? EMPTY_STATS,
    renderUrl: character.character_render_url ?? null,
    race: character.race ?? null,
    gender: character.gender ?? null,
    updatedAt: character.snapshot_updated_at,
  };
}
