const INSTANCES_URL = "https://www.raidbots.com/static/data/live/instances.json";
const ENCOUNTER_ITEMS_URL = "https://www.raidbots.com/static/data/live/encounter-items.json";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface RaidbotsInstance {
  id: number;
  name: string;
  encounters: { id: number; name: string; icon?: string }[];
}

interface RaidbotsEncounterItem {
  id: number;
  icon?: string;
  sources?: { instanceId: number; encounterId: number }[];
}

export interface ItemBossLookup {
  bossName: string;
  raidName: string;
  iconName: string | null;
}

interface StaticCache {
  bossByItemId: Map<number, ItemBossLookup>;
  bossIconByEncounterId: Map<number, string>;
  fetchedAt: number;
}

let cache: StaticCache | null = null;

async function loadStaticData(): Promise<StaticCache> {
  const [instancesRes, itemsRes] = await Promise.all([fetch(INSTANCES_URL), fetch(ENCOUNTER_ITEMS_URL)]);

  if (!instancesRes.ok || !itemsRes.ok) {
    throw new Error("No se pudo consultar los datos estáticos de Raidbots (instances/encounter-items).");
  }

  const instances = (await instancesRes.json()) as RaidbotsInstance[];
  const items = (await itemsRes.json()) as RaidbotsEncounterItem[];

  const bossByEncounterId = new Map<number, { bossName: string; raidName: string }>();
  const bossIconByEncounterId = new Map<number, string>();
  for (const instance of instances) {
    for (const encounter of instance.encounters ?? []) {
      bossByEncounterId.set(encounter.id, { bossName: encounter.name, raidName: instance.name });
      if (encounter.icon) bossIconByEncounterId.set(encounter.id, encounter.icon);
    }
  }

  const bossByItemId = new Map<number, ItemBossLookup>();
  for (const item of items) {
    const source = item.sources?.[0];
    if (!source) continue;
    const boss = bossByEncounterId.get(source.encounterId);
    if (!boss) continue;
    bossByItemId.set(item.id, {
      bossName: boss.bossName,
      raidName: boss.raidName,
      iconName: item.icon ?? null,
    });
  }

  return { bossByItemId, bossIconByEncounterId, fetchedAt: Date.now() };
}

async function loadCache(): Promise<StaticCache> {
  if (!cache || Date.now() - cache.fetchedAt > CACHE_TTL_MS) {
    cache = await loadStaticData();
  }
  return cache;
}

export async function lookupItemBoss(itemId: number): Promise<ItemBossLookup | null> {
  const c = await loadCache();
  return c.bossByItemId.get(itemId) ?? null;
}

export async function lookupBossIconUrl(journalEncounterId: number): Promise<string | null> {
  const c = await loadCache();
  const iconName = c.bossIconByEncounterId.get(journalEncounterId);
  if (!iconName) return null;
  const slug = iconName.toLowerCase().replace(/_/g, "-");
  return `https://wow.zamimg.com/images/wow/journal/${slug}.png`;
}
