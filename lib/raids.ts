export type RaidKey = string;

export type Difficulty = "world" | "normal" | "heroic" | "mythic";

export interface RaidDef {
  key: RaidKey;
  name: string;
  abbr: string;
  colorClass: string;
  color: string;
  bosses: { name: string; imageUrl: string | null }[];
  blizzardInstanceName: string | null;
  difficulties: Difficulty[];
  lockoutSource: "blizzard" | "wcl";
  forceWclManualRefresh: boolean;
  headerImageUrl: string | null;
}

export const DIFFICULTIES: { key: Difficulty; label: string }[] = [
  { key: "world", label: "Mundo" },
  { key: "normal", label: "Normal" },
  { key: "heroic", label: "Heroico" },
  { key: "mythic", label: "Mítico" },
];

export const TRACKED_LOCKOUT_DIFFICULTIES: Difficulty[] = ["normal", "heroic", "mythic"];

export function bossKey(raid: RaidKey, difficulty: Difficulty, bossIndex: number): string {
  return `${raid}-${difficulty}-${bossIndex}`;
}

const RAID_HEADER_IMAGE_POSITION: Partial<Record<RaidKey, string>> = {
  venomous_abyss: "center 30%",
};

export function raidHeaderImagePosition(raidKey: RaidKey): string {
  return RAID_HEADER_IMAGE_POSITION[raidKey] ?? "center";
}
