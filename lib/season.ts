export const SEASON_ID = 18;

export function isSeasonDataStale(syncedSeasonId: number | null | undefined): boolean {
  return typeof syncedSeasonId === "number" && syncedSeasonId !== SEASON_ID;
}

export type RewardTier = "lfr" | "normal" | "heroic" | "mythic" | "mythicSpecial";

export interface VaultRewardRow {
  min: number;
  tier: RewardTier;
  label: string;
}

export const RAID_DIFFICULTY_TIER: Record<number, RewardTier> = {
  17: "lfr",
  14: "normal",
  15: "heroic",
  16: "mythic",
  233: "mythicSpecial",
};

export const KEYSTONE_VAULT_REWARDS: VaultRewardRow[] = [
  { min: 10, tier: "mythic", label: "Mito 1/6 (318)" },
  { min: 7, tier: "heroic", label: "Héroe 4/6 (315)" },
  { min: 6, tier: "heroic", label: "Héroe 3/6 (311)" },
  { min: 4, tier: "heroic", label: "Héroe 2/6 (308)" },
  { min: 2, tier: "heroic", label: "Héroe 1/6 (305)" },
  { min: 1, tier: "normal", label: "Campeón 4/6 (302)" },
];

export const DELVE_VAULT_REWARDS: VaultRewardRow[] = [
  { min: 8, tier: "heroic", label: "Héroe 1/6 (305)" },
  { min: 7, tier: "normal", label: "Campeón 4/6 (302)" },
  { min: 6, tier: "normal", label: "Campeón 3/6 (298)" },
  { min: 5, tier: "normal", label: "Campeón 1/6 (292)" },
  { min: 4, tier: "lfr", label: "Veterano 4/6 (289)" },
  { min: 3, tier: "lfr", label: "Veterano 3/6 (285)" },
  { min: 2, tier: "lfr", label: "Veterano 2/6 (282)" },
  { min: 1, tier: "lfr", label: "Veterano 1/6 (279)" },
];

export const RAID_VAULT_ILVL: Partial<Record<RewardTier, number>> = {
  lfr: 292,
  normal: 305,
  heroic: 318,
  mythic: 335,
};
