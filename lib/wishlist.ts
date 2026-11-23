export const WISHLIST_STALE_AFTER_DAYS = 14;

export function isSimStale(importedAt: string): boolean {
  const ageMs = Date.now() - new Date(importedAt).getTime();
  return ageMs > WISHLIST_STALE_AFTER_DAYS * 24 * 60 * 60 * 1000;
}

export function isSimStaleForCharacter(importedAt: string, upgradeCount: number): boolean {
  return isSimStale(importedAt) || upgradeCount === 0;
}

export type UpgradeTier = "high" | "mid" | "low";

export function upgradeBadgeTier(upgradePct: number): UpgradeTier {
  if (upgradePct > 3) return "high";
  if (upgradePct >= 1) return "mid";
  return "low";
}

export const UPGRADE_TIERS: { key: UpgradeTier; label: string }[] = [
  { key: "high", label: "Major upgrade" },
  { key: "mid", label: "Minor upgrade" },
  { key: "low", label: "Upgrade" },
];

export const UPGRADE_TIER_COLORS: Record<UpgradeTier, string> = {
  high: "var(--color-success)",
  mid: "var(--color-warning)",
  low: "var(--color-ink-faint)",
};

export function upgradeTierLabel(tier: UpgradeTier): string {
  return UPGRADE_TIERS.find((t) => t.key === tier)?.label ?? "?";
}

export function metricLabel(metricType: string): "DPS" | "HPS" {
  return metricType === "hps" ? "HPS" : "DPS";
}

export function isRealUpgrade(upgradePct: number): boolean {
  return upgradePct > 0;
}

export type WishlistDifficulty = "normal" | "heroic" | "mythic";

export const WISHLIST_DIFFICULTIES: { key: WishlistDifficulty; label: string }[] = [
  { key: "mythic", label: "Mítico" },
  { key: "heroic", label: "Heroico" },
  { key: "normal", label: "Normal" },
];

export function difficultyLabel(difficulty: string | null): string {
  return WISHLIST_DIFFICULTIES.find((d) => d.key === difficulty)?.label ?? "?";
}

export function normalizeBossName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[’‘´`]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function roleMismatchesProvider(role: string | null, providerId: "raidbots" | "qelive"): boolean {
  if (!role) return false;
  const isHealer = role === "heal";
  return providerId === "qelive" ? !isHealer : isHealer;
}

export type ArmorCategory = "plate" | "mail" | "leather" | "cloth" | "trinket" | "weapon" | "misc";

export const ARMOR_CATEGORIES: { key: ArmorCategory; label: string }[] = [
  { key: "plate", label: "Placa" },
  { key: "mail", label: "Malla" },
  { key: "leather", label: "Cuero" },
  { key: "cloth", label: "Tela" },
  { key: "trinket", label: "Trinkets" },
  { key: "weapon", label: "Armas" },
  { key: "misc", label: "Misceláneos" },
];

const SUBCLASS_TO_CATEGORY: Record<string, ArmorCategory> = {
  Plate: "plate",
  Mail: "mail",
  Leather: "leather",
  Cloth: "cloth",
};

export function armorCategory(
  itemClass: string | null,
  itemSubclass: string | null,
  slot: string | null
): ArmorCategory {
  if (slot === "Trinket") return "trinket";
  if (itemClass === "Weapon") return "weapon";
  if (itemSubclass && SUBCLASS_TO_CATEGORY[itemSubclass]) return SUBCLASS_TO_CATEGORY[itemSubclass];
  return "misc";
}

export function armorCategoryLabel(category: ArmorCategory | null): string {
  return ARMOR_CATEGORIES.find((c) => c.key === category)?.label ?? "?";
}
