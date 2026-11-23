export interface ParsedItemLink {
  itemId: number;
  bonusIds: number[];
  name: string;
  qualityIndex: number | null;
}

const QUALITY_INDEX_TO_NAME: Record<number, string> = {
  0: "POOR",
  1: "COMMON",
  2: "UNCOMMON",
  3: "RARE",
  4: "EPIC",
  5: "LEGENDARY",
  6: "ARTIFACT",
  7: "HEIRLOOM",
};

export function qualityNameFromIndex(index: number | null): string | null {
  if (index === null) return null;
  return QUALITY_INDEX_TO_NAME[index] ?? null;
}

export function parseItemLink(raw: string | null | undefined): ParsedItemLink | null {
  if (!raw) return null;

  const linkMatch = raw.match(/\|Hitem:([^|]*)\|h\[([^\]]*)\]\|h/);
  if (!linkMatch) return null;

  const fields = linkMatch[1].split(":");
  const itemId = parseInt(fields[0], 10);
  if (!Number.isFinite(itemId) || itemId <= 0) return null;

  const numBonusIds = parseInt(fields[12] ?? "", 10) || 0;
  const bonusIds = fields
    .slice(13, 13 + numBonusIds)
    .map((s) => parseInt(s, 10))
    .filter((n): n is number => Number.isFinite(n) && n > 0);

  const qualityMatch = raw.match(/\|cnIQ(\d+):/);
  const qualityIndex = qualityMatch ? parseInt(qualityMatch[1], 10) : null;

  return { itemId, bonusIds, name: linkMatch[2], qualityIndex };
}

export function wowheadParamsForItemLink(parsed: ParsedItemLink): string {
  const bonusParam = parsed.bonusIds.length > 0 ? `&bonus=${parsed.bonusIds.join(":")}` : "";
  return `item=${parsed.itemId}${bonusParam}`;
}
