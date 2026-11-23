import { SimProviderImpl, NormalizedSim, NormalizedUpgrade, UpgradeSource, UpgradeDifficulty } from "./types";

const RAIDBOTS_URL_RE = /raidbots\.com\/(?:simbot\/report|reports)\/([A-Za-z0-9_-]{10,})/;

interface RaidbotsItemDetail {
  id: number;
  name: string;
  icon?: string;
  itemLevel?: number;
  difficulty?: string;
  encounter?: { id: number; name: string };
  instance?: { id: number; name: string };
  tags?: string[];
  offSpecItem?: boolean;
}

interface RaidbotsDroptimizerItem {
  id: string | number;
  slot?: string;
  equippedSameOrBetter?: boolean;
  item: RaidbotsItemDetail;
}

interface RaidbotsProfilesetResult {
  name: string;
  mean: number;
}

interface RaidbotsRawJson {
  sim?: {
    profilesets?: { metric?: string; results?: RaidbotsProfilesetResult[] };
    players?: { name?: string; specialization?: string; collected_data?: Record<string, { mean?: number }> }[];
  };
  simbot?: {
    player?: string;
    spec?: string;
    fightStyle?: string;
    meta?: {
      fightLength?: number;
      enemyCount?: number;
      rawFormData?: {
        character?: { name?: string; realm?: string };
        droptimizerItems?: RaidbotsDroptimizerItem[];
      };
    };
  };
}

function sourceFromItem(item: RaidbotsItemDetail): UpgradeSource {
  if (item.tags?.includes("catalyst")) return "catalyst";
  if (item.encounter) return "boss";
  return "other";
}

function difficultyFromItem(difficulty: string | undefined): UpgradeDifficulty | null {
  switch (difficulty) {
    case "raid-normal":
      return "normal";
    case "raid-heroic":
      return "heroic";
    case "raid-mythic":
      return "mythic";
    default:
      return null;
  }
}

export const raidbotsProvider: SimProviderImpl = {
  id: "raidbots",
  metricType: "dps",

  detect(input: string): boolean {
    return /raidbots\.com/.test(input);
  },

  extractId(input: string): string {
    const trimmed = input.trim();
    const match = trimmed.match(RAIDBOTS_URL_RE);
    if (match) return match[1];
    return trimmed.replace(/\/?data(\.full)?\.json$/, "");
  },

  async fetchRawResult(id: string): Promise<unknown> {
    const res = await fetch(`https://www.raidbots.com/reports/${id}/data.json`);
    if (!res.ok) {
      throw new Error(
        "No se pudo traer ese reporte de Raidbots (puede haber expirado o el link estar mal)."
      );
    }
    return res.json();
  },

  async parse(rawJson: unknown): Promise<NormalizedSim> {
    const data = rawJson as RaidbotsRawJson;
    const droptimizerItems = data.simbot?.meta?.rawFormData?.droptimizerItems;
    const results = data.sim?.profilesets?.results;

    if (!droptimizerItems || !results) {
      throw new Error(
        "Ese reporte de Raidbots no es un Droptimizer (parece ser un sim de Top Gear u otro tipo)."
      );
    }

    if (data.sim?.profilesets?.metric === "hps") {
      throw new Error(
        "Ese reporte de Raidbots parece ser de sanador -- Wishlist usa Raidbots solo para DPS/Tanks, pega el link de QE Live para healers."
      );
    }

    const baselineResult = results.find((r) => /^baseline/i.test(r.name));
    const baseline = baselineResult?.mean ?? data.sim?.players?.[0]?.collected_data?.dps?.mean ?? 0;

    const itemById = new Map(droptimizerItems.map((di) => [String(di.id), di]));

    const bestByKey = new Map<string, { di: RaidbotsDroptimizerItem; mean: number; difficulty: UpgradeDifficulty }>();

    for (const result of results) {
      const di = itemById.get(String(result.name));
      if (!di?.item?.encounter) continue;

      const difficulty = difficultyFromItem(di.item.difficulty);
      if (!difficulty) continue;

      const key = `${di.item.id}::${difficulty}`;
      const existing = bestByKey.get(key);
      if (!existing || result.mean > existing.mean) {
        bestByKey.set(key, { di, mean: result.mean, difficulty });
      }
    }

    const upgrades: NormalizedUpgrade[] = Array.from(bestByKey.values()).map(({ di, mean, difficulty }) => {
      const upgradeAbsolute = baseline > 0 ? mean - baseline : null;
      const upgradePct = baseline > 0 ? ((mean - baseline) / baseline) * 100 : 0;

      return {
        bossExternalName: di.item.encounter!.name,
        itemId: di.item.id,
        iconNameHint: di.item.icon ?? null,
        ilvl: di.item.itemLevel ?? 0,
        difficulty,
        upgradePct,
        upgradeAbsolute,
        priority: null,
        source: sourceFromItem(di.item),
        isTierPiece: false,
      };
    });

    return {
      characterName: data.simbot?.meta?.rawFormData?.character?.name ?? data.simbot?.player ?? data.sim?.players?.[0]?.name ?? "?",
      realmName: data.simbot?.meta?.rawFormData?.character?.realm ?? null,
      spec: data.simbot?.spec ?? data.sim?.players?.[0]?.specialization ?? null,
      fightStyle: data.simbot?.fightStyle ?? null,
      baselineOutput: baseline > 0 ? baseline : null,
      upgrades,
    };
  },
};
