import { getAppToken } from "./blizzard";

const BLIZZARD_LOCALE = "en_US";

async function blizzardGet<T>(region: string, path: string): Promise<T> {
  const token = await getAppToken();
  const res = await fetch(`https://${region}.api.blizzard.com${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Error consultando Blizzard Talent Tree API (${path}): ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export interface TalentTreeRef {
  treeId: number;
  specId: number;
}

const TREE_HREF_RE = /\/talent-tree\/(\d+)\/playable-specialization\/(\d+)/;

export async function fetchTalentTreeIndex(region: string): Promise<TalentTreeRef[]> {
  const data = await blizzardGet<{ spec_talent_trees?: { key?: { href?: string } }[] }>(
    region,
    `/data/wow/talent-tree/index?namespace=static-${region}&locale=${BLIZZARD_LOCALE}`
  );

  const refs: TalentTreeRef[] = [];
  for (const entry of data.spec_talent_trees ?? []) {
    const match = entry.key?.href?.match(TREE_HREF_RE);
    if (!match) continue;
    refs.push({ treeId: parseInt(match[1], 10), specId: parseInt(match[2], 10) });
  }
  return refs;
}

export interface TalentSpellCandidate {
  spellId: number;
  name: string;
  className: string;
  specName: string | null;
}

interface RawSpellTooltip {
  spell_tooltip?: { spell?: { id?: number; name?: string } };
}
interface RawRank {
  tooltip?: RawSpellTooltip;
  choice_of_tooltips?: RawSpellTooltip[];
}
interface RawNode {
  ranks?: RawRank[];
}

function collectSpellsFromNodes(nodes: RawNode[] | undefined): { spellId: number; name: string }[] {
  const found: { spellId: number; name: string }[] = [];
  for (const node of nodes ?? []) {
    for (const rank of node.ranks ?? []) {
      const tooltips = rank.choice_of_tooltips ?? (rank.tooltip ? [rank.tooltip] : []);
      for (const tooltip of tooltips) {
        const spell = tooltip.spell_tooltip?.spell;
        if (typeof spell?.id === "number" && spell.name) {
          found.push({ spellId: spell.id, name: spell.name });
        }
      }
    }
  }
  return found;
}

export async function fetchTalentTreeSpells(
  region: string,
  ref: TalentTreeRef
): Promise<TalentSpellCandidate[]> {
  const data = await blizzardGet<{
    playable_class?: { name?: string };
    playable_specialization?: { name?: string };
    class_talent_nodes?: RawNode[];
    spec_talent_nodes?: RawNode[];
    hero_talent_trees?: { hero_talent_nodes?: RawNode[] }[];
  }>(
    region,
    `/data/wow/talent-tree/${ref.treeId}/playable-specialization/${ref.specId}?namespace=static-${region}&locale=${BLIZZARD_LOCALE}`
  );

  const className = data.playable_class?.name ?? "?";
  const specName = data.playable_specialization?.name ?? "?";

  const candidates: TalentSpellCandidate[] = [];
  for (const { spellId, name } of collectSpellsFromNodes(data.class_talent_nodes)) {
    candidates.push({ spellId, name, className, specName: null });
  }
  for (const { spellId, name } of collectSpellsFromNodes(data.spec_talent_nodes)) {
    candidates.push({ spellId, name, className, specName });
  }
  for (const heroTree of data.hero_talent_trees ?? []) {
    for (const { spellId, name } of collectSpellsFromNodes(heroTree.hero_talent_nodes)) {
      candidates.push({ spellId, name, className, specName });
    }
  }
  return candidates;
}

async function fetchWowheadIconFallback(spellId: number, region: string): Promise<string | null> {
  try {
    const res = await fetch(`https://nether.wowhead.com/tooltip/spell/${spellId}?dataEnv=1&locale=0`);
    if (!res.ok) return null;
    const data = (await res.json()) as { icon?: string };
    if (!data.icon) return null;
    return `https://render.worldofwarcraft.com/${region}/icons/56/${data.icon}.jpg`;
  } catch {
    return null;
  }
}

const WOW_CLASS_NAMES = [
  "Warrior",
  "Paladin",
  "Hunter",
  "Rogue",
  "Priest",
  "Death Knight",
  "Shaman",
  "Mage",
  "Warlock",
  "Monk",
  "Druid",
  "Demon Hunter",
  "Evoker",
];

export async function isPlayerOnlySpell(spellId: number): Promise<boolean> {
  try {
    const res = await fetch(`https://nether.wowhead.com/tooltip/spell/${spellId}?dataEnv=1&locale=0`);
    if (!res.ok) return false;
    const data = (await res.json()) as { tooltip?: string };
    const text = (data.tooltip ?? "").replace(/<[^>]+>/g, " ");
    return WOW_CLASS_NAMES.some((className) => text.includes(`Requires ${className}`));
  } catch {
    return false;
  }
}

export async function fetchSpellIcon(region: string, spellId: number): Promise<string | null> {
  try {
    const data = await blizzardGet<{ assets?: { key?: string; value?: string }[] }>(
      region,
      `/data/wow/media/spell/${spellId}?namespace=static-${region}`
    );
    const icon = data.assets?.find((a) => a.key === "icon")?.value ?? null;
    if (icon) return icon;
  } catch {
  }
  return fetchWowheadIconFallback(spellId, region);
}
