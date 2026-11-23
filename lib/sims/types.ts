export type SimProvider2 = "raidbots" | "qelive";
export type MetricType = "dps" | "hps";
export type UpgradeSource = "boss" | "vault" | "catalyst" | "crafted" | "other";
export type UpgradeDifficulty = "normal" | "heroic" | "mythic";

export interface NormalizedUpgrade {
  bossExternalName: string;
  itemId: number;
  iconNameHint: string | null;
  ilvl: number;
  difficulty: UpgradeDifficulty;
  upgradePct: number;
  upgradeAbsolute: number | null;
  priority: number | null;
  source: UpgradeSource;
  isTierPiece: boolean;
}

export interface NormalizedSim {
  characterName: string;
  realmName: string | null;
  spec: string | null;
  fightStyle: string | null;
  baselineOutput: number | null;
  upgrades: NormalizedUpgrade[];
}

export interface SimProviderImpl {
  id: SimProvider2;
  metricType: MetricType;
  detect(input: string): boolean;
  extractId(input: string): string;
  fetchRawResult(id: string): Promise<unknown>;
  parse(rawJson: unknown): Promise<NormalizedSim>;
}
