import { SimProviderImpl, NormalizedSim, NormalizedUpgrade, UpgradeDifficulty } from "./types";
import { lookupItemBoss } from "./raidbots-static";

const QE_URL_RE = /questionablyepic\.com\/(?:live|ptr)\/upgradereport\/([a-z]{12})/;

interface QeDifferential {
  item: number;
  dropLoc: string;
  dropDifficulty: number;
  level: number;
  rawDiff: number;
  percDiff: number;
}

function difficultyFromDropDifficulty(dropDifficulty: number): UpgradeDifficulty | null {
  if (dropDifficulty === 2 || dropDifficulty === 3) return "normal";
  if (dropDifficulty === 4 || dropDifficulty === 5) return "heroic";
  if (dropDifficulty === 6 || dropDifficulty === 7) return "mythic";
  return null;
}

interface QeReport {
  error?: string;
  playername?: string;
  realm?: string;
  spec?: string;
  results?: QeDifferential[];
}

function deriveBaselineOutput(results: QeDifferential[]): number | null {
  const implied = results
    .filter((r) => r.percDiff !== 0)
    .map((r) => (r.rawDiff / r.percDiff) * 100)
    .filter((v) => Number.isFinite(v) && v > 0);
  if (implied.length === 0) return null;
  implied.sort((a, b) => a - b);
  const mid = Math.floor(implied.length / 2);
  return implied.length % 2 === 0 ? (implied[mid - 1] + implied[mid]) / 2 : implied[mid];
}

export const qeliveProvider: SimProviderImpl = {
  id: "qelive",
  metricType: "hps",

  detect(input: string): boolean {
    return /questionablyepic\.com/.test(input);
  },

  extractId(input: string): string {
    const trimmed = input.trim();
    const match = trimmed.match(QE_URL_RE);
    if (match) return match[1];
    return trimmed.replace(/\/$/, "").split("/").pop() ?? trimmed;
  },

  async fetchRawResult(id: string): Promise<unknown> {
    const res = await fetch(
      `https://questionablyepic.com/api/getUpgradeReport.php?reportID=${encodeURIComponent(id)}`
    );
    if (!res.ok) {
      throw new Error("No se pudo traer ese reporte de QE Live (puede haber expirado o el link estar mal).");
    }
    const raw = await res.json();
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  },

  async parse(rawJson: unknown): Promise<NormalizedSim> {
    const report = rawJson as QeReport;

    if (report.error || !report.results) {
      throw new Error("No se encontró ese reporte de QE Live (puede haber expirado o el link estar mal).");
    }

    const raidResults = report.results.filter((r) => r.dropLoc === "Raid" && r.percDiff > 0);

    const lookups = await Promise.all(raidResults.map((r) => lookupItemBoss(r.item)));

    const upgrades: NormalizedUpgrade[] = [];
    raidResults.forEach((r, idx) => {
      const boss = lookups[idx];
      if (!boss) return;

      const difficulty = difficultyFromDropDifficulty(r.dropDifficulty);
      if (!difficulty) return;

      upgrades.push({
        bossExternalName: boss.bossName,
        itemId: r.item,
        iconNameHint: boss.iconName,
        ilvl: r.level,
        difficulty,
        upgradePct: r.percDiff,
        upgradeAbsolute: r.rawDiff,
        priority: null,
        source: "boss",
        isTierPiece: false,
      });
    });

    return {
      characterName: report.playername ?? "?",
      realmName: report.realm ?? null,
      spec: report.spec ?? null,
      fightStyle: null,
      baselineOutput: deriveBaselineOutput(report.results),
      upgrades,
    };
  },
};
