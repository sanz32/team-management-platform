import { getAppToken } from "./blizzard";

const BLIZZARD_LOCALE = "en_US";

async function blizzardGet<T>(region: string, path: string): Promise<T> {
  const token = await getAppToken();
  const url = `https://${region}.api.blizzard.com${path}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    throw new Error(`Error consultando Blizzard Journal (${path}): ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export interface JournalInstanceListItem {
  id: number;
  name: string;
}

export async function fetchJournalInstanceIndex(region: string): Promise<JournalInstanceListItem[]> {
  const data = await blizzardGet<{ instances?: { id: number; name: string }[] }>(
    region,
    `/data/wow/journal-instance/index?namespace=static-${region}&locale=${BLIZZARD_LOCALE}`
  );
  return (data.instances ?? []).map((i) => ({ id: i.id, name: i.name }));
}

export interface JournalInstanceDetail {
  id: number;
  name: string;
  isRaid: boolean;
  expansionId: number | null;
  encounters: { id: number; name: string }[];
}

export async function fetchJournalInstanceDetail(
  region: string,
  instanceId: number
): Promise<JournalInstanceDetail> {
  const data = await blizzardGet<{
    id: number;
    name: string;
    category?: { type?: string };
    expansion?: { id?: number };
    encounters?: { id: number; name: string }[];
  }>(region, `/data/wow/journal-instance/${instanceId}?namespace=static-${region}&locale=${BLIZZARD_LOCALE}`);

  return {
    id: data.id,
    name: data.name,
    isRaid: data.category?.type === "RAID",
    expansionId: data.expansion?.id ?? null,
    encounters: data.encounters ?? [],
  };
}

export async function fetchEncounterBossImage(
  region: string,
  journalEncounterId: number
): Promise<string | null> {
  try {
    const encounter = await blizzardGet<{
      creatures?: { creature_display?: { id?: number } }[];
    }>(
      region,
      `/data/wow/journal-encounter/${journalEncounterId}?namespace=static-${region}&locale=${BLIZZARD_LOCALE}`
    );

    const creatureDisplayId = encounter.creatures?.[0]?.creature_display?.id;
    if (!creatureDisplayId) return null;

    const media = await blizzardGet<{ assets?: { key?: string; value?: string }[] }>(
      region,
      `/data/wow/media/creature-display/${creatureDisplayId}?namespace=static-${region}&locale=${BLIZZARD_LOCALE}`
    );

    return media.assets?.find((a) => a.key === "zoom")?.value ?? null;
  } catch {
    return null;
  }
}
