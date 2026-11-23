import { RaidDef, Difficulty, bossKey } from "./raids";

let cachedToken: { token: string; expiresAt: number } | null = null;

export async function getAppToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.token;
  }

  const clientId = process.env.BLIZZARD_CLIENT_ID!;
  const clientSecret = process.env.BLIZZARD_CLIENT_SECRET!;

  const res = await fetch("https://oauth.battle.net/token", {
    method: "POST",
    headers: {
      Authorization:
        "Basic " +
        Buffer.from(`${clientId}:${clientSecret}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) {
    throw new Error(`Error obteniendo token de Blizzard: ${res.status}`);
  }

  const data = await res.json();
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 300) * 1000,
  };

  return cachedToken.token;
}

export interface CharacterData {
  id: number | null;
  ilvl: number | null;
  level: number | null;
  class: string | null;
  activeSpec: string | null;
  race: string | null;
  gender: string | null;
  faction: string | null;
  realmName: string | null;
  found: boolean;
}

const TANK_SPECS = new Set(["blood", "guardian", "protection", "vengeance", "brewmaster"]);
const HEAL_SPECS = new Set(["holy", "discipline", "restoration", "mistweaver", "preservation"]);

export type Role = "tank" | "heal" | "dps";

export function roleFromSpec(specName: string | null): Role {
  if (!specName) return "dps";
  const spec = specName.toLowerCase();
  if (TANK_SPECS.has(spec)) return "tank";
  if (HEAL_SPECS.has(spec)) return "heal";
  return "dps";
}

export async function fetchCharacterData(
  region: string,
  realmSlug: string,
  characterName: string
): Promise<CharacterData> {
  const token = await getAppToken();
  const namespace = `profile-${region}`;
  const locale = "en_US";
  const nameSlug = encodeURIComponent(characterName.toLowerCase());

  const url = `https://${region}.api.blizzard.com/profile/wow/character/${realmSlug}/${nameSlug}?namespace=${namespace}&locale=${locale}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 404) {
    return {
      id: null,
      ilvl: null,
      level: null,
      class: null,
      activeSpec: null,
      race: null,
      gender: null,
      faction: null,
      realmName: null,
      found: false,
    };
  }

  if (!res.ok) {
    throw new Error(
      `Error consultando personaje ${characterName}-${realmSlug}: ${res.status}`
    );
  }

  const data = await res.json();

  return {
    id: typeof data.id === "number" ? data.id : null,
    ilvl: data.equipped_item_level ?? null,
    level: typeof data.level === "number" ? data.level : null,
    class: data.character_class?.name ?? null,
    activeSpec: data.active_spec?.name ?? null,
    race: data.race?.name ?? null,
    gender: data.gender?.name ?? null,
    faction: data.faction?.name ?? null,
    realmName: data.realm?.name ?? null,
    found: true,
  };
}

export interface ItemDetails {
  name: string | null;
  slot: string | null;
  itemClass: string | null;
  itemSubclass: string | null;
  quality: string | null;
}

export async function fetchItemDetails(region: string, itemId: number): Promise<ItemDetails | null> {
  try {
    const token = await getAppToken();
    const namespace = `static-${region}`;
    const url = `https://${region}.api.blizzard.com/data/wow/item/${itemId}?namespace=${namespace}&locale=en_US`;

    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return null;

    const data = (await res.json()) as {
      name?: string;
      inventory_type?: { name?: string };
      item_class?: { name?: string };
      item_subclass?: { name?: string };
      quality?: { type?: string };
    };

    return {
      name: data.name ?? null,
      slot: data.inventory_type?.name ?? null,
      itemClass: data.item_class?.name ?? null,
      itemSubclass: data.item_subclass?.name ?? null,
      quality: data.quality?.type ?? null,
    };
  } catch {
    return null;
  }
}

export interface ItemSetInfo {
  setId: number;
  setName: string;
  members: { id: number; name: string }[];
}

export async function fetchItemSetInfo(region: string, itemId: number): Promise<ItemSetInfo | null> {
  try {
    const token = await getAppToken();
    const namespace = `static-${region}`;
    const url = `https://${region}.api.blizzard.com/data/wow/item/${itemId}?namespace=${namespace}&locale=en_US`;

    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return null;

    const data = (await res.json()) as {
      preview_item?: {
        set?: {
          item_set?: { id?: number; name?: string };
          items?: { item?: { id?: number; name?: string } }[];
        };
      };
    };

    const set = data.preview_item?.set;
    const itemSet = set?.item_set;
    if (itemSet?.id == null) return null;

    return {
      setId: itemSet.id,
      setName: itemSet.name ?? "Set",
      members: (set?.items ?? [])
        .map((entry) => entry.item)
        .filter((item): item is { id: number; name?: string } => item?.id != null)
        .map((item) => ({ id: item.id, name: item.name ?? "" })),
    };
  } catch {
    return null;
  }
}

function cleanEnchantDisplayString(raw: string): string {
  return raw
    .replace(/\s*\|A:[^|]*\|a\s*/g, "")
    .replace(/^Enchanted:\s*/, "")
    .trim();
}

export interface EquippedGem {
  itemId: number;
  name: string;
  displayString: string | null;
  iconUrl: string | null;
}

export interface EquippedEnchant {
  enchantmentId: number;
  slotType: string;
  displayString: string;
  sourceItemId: number | null;
  iconUrl: string | null;
}

export interface EquippedItem {
  itemId: number | null;
  slot: string;
  slotType: string;
  name: string;
  quality: string;
  ilvl: number | null;
  iconUrl: string | null;
  bonusList: number[];
  gems: EquippedGem[];
  enchants: EquippedEnchant[];
}

export interface CharacterEquipment {
  found: boolean;
  items: EquippedItem[];
}

export async function fetchCharacterEquipment(
  region: string,
  realmSlug: string,
  characterName: string
): Promise<CharacterEquipment> {
  const token = await getAppToken();
  const namespace = `profile-${region}`;
  const locale = "en_US";
  const nameSlug = encodeURIComponent(characterName.toLowerCase());

  const url = `https://${region}.api.blizzard.com/profile/wow/character/${realmSlug}/${nameSlug}/equipment?namespace=${namespace}&locale=${locale}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 404) {
    return { found: false, items: [] };
  }

  if (!res.ok) {
    throw new Error(
      `Error consultando equipo de ${characterName}-${realmSlug}: ${res.status}`
    );
  }

  interface BlizzardEquippedItemResponse {
    item?: { id?: number; name?: string };
    slot?: { name?: string; type?: string };
    name?: string;
    quality?: { type?: string };
    level?: { value?: number };
    bonus_list?: number[];
    sockets?: { item?: { id?: number; name?: string }; display_string?: string }[];
    enchantments?: {
      display_string?: string;
      enchantment_id?: number;
      enchantment_slot?: { id?: number; type?: string };
      source_item?: { id?: number; name?: string };
    }[];
  }
  interface BlizzardEquipmentResponse {
    equipped_items?: BlizzardEquippedItemResponse[];
  }

  const data = (await res.json()) as BlizzardEquipmentResponse;

  const items: EquippedItem[] = (data.equipped_items ?? []).map((it) => ({
    itemId: it.item?.id ?? null,
    slot: it.slot?.name ?? it.slot?.type ?? "?",
    slotType: it.slot?.type ?? "?",
    name: it.name ?? it.item?.name ?? "?",
    quality: it.quality?.type ?? "COMMON",
    ilvl: it.level?.value ?? null,
    iconUrl: null,
    bonusList: it.bonus_list ?? [],
    gems: (it.sockets ?? [])
      .filter((s): s is { item: { id: number; name?: string }; display_string?: string } => !!s.item?.id)
      .map((s) => ({
        itemId: s.item.id,
        name: s.item.name ?? "Gema",
        displayString: s.display_string ?? null,
        iconUrl: null,
      })),
    enchants: (it.enchantments ?? [])
      .filter((e) => e.enchantment_id != null)
      .map((e) => ({
        enchantmentId: e.enchantment_id!,
        slotType: e.enchantment_slot?.type ?? "PERMANENT",
        displayString: cleanEnchantDisplayString(e.display_string ?? ""),
        sourceItemId: e.source_item?.id ?? null,
        iconUrl: null,
      })),
  }));

  return { found: true, items };
}

interface BlizzardMediaResponse {
  assets?: { key?: string; value?: string }[];
}

export async function fetchItemIcon(region: string, itemId: number): Promise<string | null> {
  try {
    const token = await getAppToken();
    const namespace = `static-${region}`;
    const url = `https://${region}.api.blizzard.com/data/wow/media/item/${itemId}?namespace=${namespace}`;

    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return null;

    const data = (await res.json()) as BlizzardMediaResponse;
    return (data.assets ?? []).find((a) => a.key === "icon")?.value ?? null;
  } catch {
    return null;
  }
}

export interface CharacterMedia {
  found: boolean;
  renderUrl: string | null;
  avatarUrl: string | null;
}

export async function fetchCharacterMedia(
  region: string,
  realmSlug: string,
  characterName: string
): Promise<CharacterMedia> {
  const token = await getAppToken();
  const namespace = `profile-${region}`;
  const locale = "en_US";
  const nameSlug = encodeURIComponent(characterName.toLowerCase());

  const url = `https://${region}.api.blizzard.com/profile/wow/character/${realmSlug}/${nameSlug}/character-media?namespace=${namespace}&locale=${locale}`;

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });

  if (res.status === 404) return { found: false, renderUrl: null, avatarUrl: null };
  if (!res.ok) {
    throw new Error(`Error consultando render de ${characterName}-${realmSlug}: ${res.status}`);
  }

  const data = (await res.json()) as BlizzardMediaResponse;
  const assets = data.assets ?? [];

  return {
    found: true,
    renderUrl: assets.find((a) => a.key === "main-raw")?.value ?? null,
    avatarUrl: assets.find((a) => a.key === "avatar")?.value ?? null,
  };
}

export interface RealmSummary {
  slug: string;
  name: string;
}

const realmIndexCache = new Map<string, RealmSummary[]>();

export async function fetchRealmIndex(region: string): Promise<RealmSummary[]> {
  const cached = realmIndexCache.get(region);
  if (cached) return cached;

  const token = await getAppToken();
  const url = `https://${region}.api.blizzard.com/data/wow/realm/index?namespace=dynamic-${region}&locale=en_US`;

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Error consultando el índice de reinos de ${region}: ${res.status}`);

  const data = (await res.json()) as { realms?: { slug?: string; name?: string }[] };
  const realms = (data.realms ?? [])
    .filter((r): r is { slug: string; name: string } => !!r.slug && !!r.name)
    .map((r) => ({ slug: r.slug, name: r.name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  realmIndexCache.set(region, realms);
  return realms;
}

export interface CharacterStats {
  found: boolean;
  strength: number | null;
  agility: number | null;
  intellect: number | null;
  stamina: number | null;
  critPct: number | null;
  hastePct: number | null;
  masteryPct: number | null;
  versatilityPct: number | null;
  health: number | null;
}

export async function fetchCharacterStatistics(
  region: string,
  realmSlug: string,
  characterName: string
): Promise<CharacterStats> {
  const token = await getAppToken();
  const namespace = `profile-${region}`;
  const locale = "en_US";
  const nameSlug = encodeURIComponent(characterName.toLowerCase());

  const url = `https://${region}.api.blizzard.com/profile/wow/character/${realmSlug}/${nameSlug}/statistics?namespace=${namespace}&locale=${locale}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const empty: CharacterStats = {
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

  if (res.status === 404) return empty;

  if (!res.ok) {
    throw new Error(
      `Error consultando estadísticas de ${characterName}-${realmSlug}: ${res.status}`
    );
  }

  const data = await res.json();

  return {
    found: true,
    strength: data.strength?.effective ?? null,
    agility: data.agility?.effective ?? null,
    intellect: data.intellect?.effective ?? null,
    stamina: data.stamina?.effective ?? null,
    critPct: data.melee_crit?.value ?? data.spell_crit?.value ?? null,
    hastePct: data.melee_haste?.value ?? data.spell_haste?.value ?? null,
    masteryPct: data.mastery?.value ?? null,
    versatilityPct: data.versatility_damage_done_bonus ?? data.versatility_healing_done_bonus ?? null,
    health: data.health ?? null,
  };
}

export async function fetchMythicKeystoneRating(
  region: string,
  realmSlug: string,
  characterName: string
): Promise<number | null> {
  const token = await getAppToken();
  const namespace = `profile-${region}`;
  const locale = "en_US";
  const nameSlug = encodeURIComponent(characterName.toLowerCase());

  const url = `https://${region}.api.blizzard.com/profile/wow/character/${realmSlug}/${nameSlug}/mythic-keystone-profile?namespace=${namespace}&locale=${locale}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) return null;

  const data = (await res.json()) as { current_mythic_rating?: { rating?: number } };
  const rating = data.current_mythic_rating?.rating;
  return typeof rating === "number" ? Math.round(rating) : null;
}

export interface RaidKill {
  bossKey: string;
  lastKillTimestamp: number;
  completedCount: number;
}

export interface RaidLockoutData {
  found: boolean;
  kills: RaidKill[];
}

function matchDifficulty(difficultyType: string): Difficulty | null {
  const type = difficultyType.toUpperCase();
  if (type === "NORMAL") return "normal";
  if (type === "HEROIC") return "heroic";
  if (type === "MYTHIC") return "mythic";
  return null;
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[’‘´`]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export async function fetchRaidLockouts(
  region: string,
  realmSlug: string,
  characterName: string,
  raidDefs: RaidDef[]
): Promise<RaidLockoutData> {
  const matchableRaids = raidDefs.filter(
    (r): r is RaidDef & { blizzardInstanceName: string } => r.blizzardInstanceName !== null
  );
  const CURRENT_RAID_NAMES = new Set(matchableRaids.map((r) => normalizeName(r.blizzardInstanceName)));

  const token = await getAppToken();
  const namespace = `profile-${region}`;
  const locale = "en_US";
  const nameSlug = encodeURIComponent(characterName.toLowerCase());

  const url = `https://${region}.api.blizzard.com/profile/wow/character/${realmSlug}/${nameSlug}/encounters/raids?namespace=${namespace}&locale=${locale}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 404) {
    return { found: false, kills: [] };
  }

  if (!res.ok) {
    throw new Error(
      `Error consultando encuentros de raid de ${characterName}-${realmSlug}: ${res.status}`
    );
  }

  interface BlizzardRaidEncounterResponse {
    last_kill_timestamp?: number;
    completed_count?: number;
    encounter?: { name?: string };
  }
  interface BlizzardRaidEncountersResponse {
    expansions?: {
      instances?: {
        instance?: { name?: string };
        modes?: {
          difficulty?: { type?: string };
          progress?: { encounters?: BlizzardRaidEncounterResponse[] };
        }[];
      }[];
    }[];
  }

  const data = (await res.json()) as BlizzardRaidEncountersResponse;
  const killsByBoss = new Map<string, { lastKillTimestamp: number; completedCount: number }>();

  for (const expansion of data.expansions ?? []) {
    for (const instance of expansion.instances ?? []) {
      const instanceName = normalizeName(instance.instance?.name ?? "");
      if (!CURRENT_RAID_NAMES.has(instanceName)) continue;

      const raidDef = matchableRaids.find((r) => normalizeName(r.blizzardInstanceName) === instanceName)!;

      for (const mode of instance.modes ?? []) {
        const difficulty = matchDifficulty(mode.difficulty?.type ?? "");
        if (!difficulty) continue;
        if (!raidDef.difficulties.includes(difficulty)) continue;

        const encounters = mode.progress?.encounters ?? [];
        encounters.forEach((enc, idx: number) => {
          if (!enc.last_kill_timestamp) return;

          const completedCount = enc.completed_count ?? 0;
          const encName = normalizeName(enc.encounter?.name ?? "");
          let bossIndex = raidDef.bosses.findIndex(
            (b) => normalizeName(b.name) === encName
          );
          if (bossIndex === -1) bossIndex = idx;
          if (bossIndex < 0 || bossIndex >= raidDef.bosses.length) return;

          const key = bossKey(raidDef.key, difficulty, bossIndex + 1);
          const existing = killsByBoss.get(key);
          if (!existing || completedCount > existing.completedCount) {
            killsByBoss.set(key, {
              lastKillTimestamp: enc.last_kill_timestamp ?? 0,
              completedCount,
            });
          }
        });
      }
    }
  }

  const kills: RaidKill[] = Array.from(killsByBoss.entries()).map(
    ([bossKeyValue, { lastKillTimestamp, completedCount }]) => ({
      bossKey: bossKeyValue,
      lastKillTimestamp,
      completedCount,
    })
  );

  return { found: true, kills };
}

export interface PlayableSpecializationSummary {
  specId: number;
  name: string;
}

export async function fetchPlayableSpecializationIndex(
  region: string
): Promise<PlayableSpecializationSummary[]> {
  const token = await getAppToken();
  const namespace = `static-${region}`;
  const url = `https://${region}.api.blizzard.com/data/wow/playable-specialization/index?namespace=${namespace}&locale=en_US`;

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Error consultando el índice de especializaciones: ${res.status}`);

  const data = (await res.json()) as { character_specializations?: { id: number; name: string }[] };
  return (data.character_specializations ?? []).map((s) => ({ specId: s.id, name: s.name }));
}

export interface PlayableSpecializationDetail {
  specId: number;
  className: string;
  specName: string;
  role: "tank" | "heal" | "dps";
  iconUrl: string | null;
}

const SPEC_ROLE_MAP: Record<string, "tank" | "heal" | "dps"> = {
  TANK: "tank",
  HEALER: "heal",
  DAMAGE: "dps",
};

export async function fetchPlayableSpecializationDetail(
  region: string,
  specId: number
): Promise<PlayableSpecializationDetail | null> {
  try {
    const token = await getAppToken();
    const namespace = `static-${region}`;

    const [detailRes, mediaRes] = await Promise.all([
      fetch(
        `https://${region}.api.blizzard.com/data/wow/playable-specialization/${specId}?namespace=${namespace}&locale=en_US`,
        { headers: { Authorization: `Bearer ${token}` } }
      ),
      fetch(
        `https://${region}.api.blizzard.com/data/wow/media/playable-specialization/${specId}?namespace=${namespace}&locale=en_US`,
        { headers: { Authorization: `Bearer ${token}` } }
      ),
    ]);

    if (!detailRes.ok) return null;

    const detail = (await detailRes.json()) as {
      playable_class?: { name?: string };
      name?: string;
      role?: { type?: string };
    };

    const media = mediaRes.ok
      ? ((await mediaRes.json()) as { assets?: { key?: string; value?: string }[] })
      : null;

    return {
      specId,
      className: detail.playable_class?.name ?? "?",
      specName: detail.name ?? "?",
      role: SPEC_ROLE_MAP[detail.role?.type ?? ""] ?? "dps",
      iconUrl: media?.assets?.find((a) => a.key === "icon")?.value ?? null,
    };
  } catch {
    return null;
  }
}
