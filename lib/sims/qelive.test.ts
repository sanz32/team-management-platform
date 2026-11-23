import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { qeliveProvider } from "./qelive";

const STATIC_INSTANCES = [
  { id: 1305, name: "Sporefall", encounters: [{ id: 2711, name: "Rotmire" }] },
  { id: 1307, name: "The Voidspire", encounters: [{ id: 2733, name: "Imperator Averzian" }] },
];

const STATIC_ENCOUNTER_ITEMS = [
  { id: 300, icon: "inv_chest_test", sources: [{ instanceId: 1305, encounterId: 2711 }] },
  { id: 400, icon: "inv_ring_test", sources: [{ instanceId: 1307, encounterId: 2733 }] },
];

function mockFetch(reportResponse: unknown, wrapInString = false) {
  return vi.fn(async (url: string) => {
    if (url.includes("instances.json")) {
      return { ok: true, json: async () => STATIC_INSTANCES } as Response;
    }
    if (url.includes("encounter-items.json")) {
      return { ok: true, json: async () => STATIC_ENCOUNTER_ITEMS } as Response;
    }
    if (url.includes("getUpgradeReport.php")) {
      return {
        ok: true,
        json: async () => (wrapInString ? JSON.stringify(reportResponse) : reportResponse),
      } as Response;
    }
    throw new Error(`URL no mockeada en el test: ${url}`);
  });
}

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch({}));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("qeliveProvider.detect", () => {
  it("reconoce cualquier link de questionablyepic.com", () => {
    expect(qeliveProvider.detect("https://questionablyepic.com/live/upgradereport/abcdefghijkl")).toBe(true);
    expect(qeliveProvider.detect("https://www.raidbots.com/simbot/report/xyz")).toBe(false);
  });
});

describe("qeliveProvider.extractId", () => {
  it("extrae el id de 12 letras del link de upgradereport", () => {
    expect(qeliveProvider.extractId("https://questionablyepic.com/live/upgradereport/abcdefhijklm")).toBe(
      "abcdefhijklm"
    );
  });

  it("tolera una barra final", () => {
    expect(qeliveProvider.extractId("https://questionablyepic.com/live/upgradereport/abcdefhijklm/")).toBe(
      "abcdefhijklm"
    );
  });
});

describe("qeliveProvider.fetchRawResult", () => {
  it("desenvuelve el doble JSON cuando la API lo devuelve como string", async () => {
    vi.stubGlobal("fetch", mockFetch({ playername: "Lyra", results: [] }, true));
    const raw = await qeliveProvider.fetchRawResult("abcdefhijklm");
    expect(raw).toEqual({ playername: "Lyra", results: [] });
  });

  it("devuelve el objeto directo cuando la API NO lo envuelve", async () => {
    vi.stubGlobal("fetch", mockFetch({ playername: "Lyra", results: [] }, false));
    const raw = await qeliveProvider.fetchRawResult("abcdefhijklm");
    expect(raw).toEqual({ playername: "Lyra", results: [] });
  });
});

describe("qeliveProvider.parse", () => {
  it("usa percDiff (no score) como upgradePct y rawDiff como absoluto", async () => {
    const raw = {
      playername: "Lyra",
      realm: "Area 52",
      spec: "Holy Paladin",
      results: [
        { item: 300, dropLoc: "Raid", dropDifficulty: 6, level: 285, rawDiff: 1200, percDiff: 4.5, score: 999 },
      ],
    };
    const normalized = await qeliveProvider.parse(raw);

    expect(normalized.upgrades).toHaveLength(1);
    expect(normalized.upgrades[0].upgradePct).toBe(4.5);
    expect(normalized.upgrades[0].upgradeAbsolute).toBe(1200);
    expect(normalized.upgrades[0].bossExternalName).toBe("Rotmire");
    expect(normalized.upgrades[0].difficulty).toBe("mythic");
    expect(normalized.characterName).toBe("Lyra");
    expect(normalized.realmName).toBe("Area 52");
  });

  it("mapea dropDifficulty a normal/heroico/mitico (variantes Max incluidas)", async () => {
    const raw = {
      playername: "Lyra",
      results: [
        { item: 300, dropLoc: "Raid", dropDifficulty: 2, level: 259, rawDiff: 400, percDiff: 2, score: 1 },
        { item: 300, dropLoc: "Raid", dropDifficulty: 5, level: 272, rawDiff: 800, percDiff: 3, score: 1 },
      ],
    };
    const normalized = await qeliveProvider.parse(raw);
    expect(normalized.upgrades.find((u) => u.ilvl === 259)?.difficulty).toBe("normal");
    expect(normalized.upgrades.find((u) => u.ilvl === 272)?.difficulty).toBe("heroic");
  });

  it("descarta items de LFR (dropDifficulty 0/1)", async () => {
    const raw = {
      playername: "Lyra",
      results: [{ item: 300, dropLoc: "Raid", dropDifficulty: 1, level: 246, rawDiff: 200, percDiff: 2, score: 1 }],
    };
    const normalized = await qeliveProvider.parse(raw);
    expect(normalized.upgrades).toHaveLength(0);
  });

  it("filtra items que no son de Raid (Dungeon/Crafted/Delves)", async () => {
    const raw = {
      playername: "Lyra",
      results: [
        { item: 300, dropLoc: "Raid", dropDifficulty: 6, level: 285, rawDiff: 1000, percDiff: 3, score: 1 },
        { item: 400, dropLoc: "Dungeon", dropDifficulty: 6, level: 285, rawDiff: 500, percDiff: 2, score: 1 },
      ],
    };
    const normalized = await qeliveProvider.parse(raw);
    expect(normalized.upgrades).toHaveLength(1);
    expect(normalized.upgrades[0].itemId).toBe(300);
  });

  it("filtra mejoras con percDiff <= 0", async () => {
    const raw = {
      playername: "Lyra",
      results: [{ item: 300, dropLoc: "Raid", dropDifficulty: 6, level: 285, rawDiff: -50, percDiff: 0, score: 0 }],
    };
    const normalized = await qeliveProvider.parse(raw);
    expect(normalized.upgrades).toHaveLength(0);
  });

  it("descarta items que no matchean contra la tabla estatica de bosses", async () => {
    const raw = {
      playername: "Lyra",
      results: [{ item: 999999, dropLoc: "Raid", dropDifficulty: 6, level: 285, rawDiff: 500, percDiff: 2, score: 1 }],
    };
    const normalized = await qeliveProvider.parse(raw);
    expect(normalized.upgrades).toHaveLength(0);
  });

  it("rechaza un reporte con error", async () => {
    await expect(qeliveProvider.parse({ error: "Report not found" })).rejects.toThrow(/No se encontró/);
  });

  it("deriva baselineOutput de rawDiff/percDiff (QE Live no lo expone directo)", async () => {
    const raw = {
      playername: "Lyra",
      results: [
        { item: 300, dropLoc: "Raid", dropDifficulty: 6, level: 285, rawDiff: 1800, percDiff: 4.5, score: 1 },
        { item: 400, dropLoc: "Raid", dropDifficulty: 4, level: 272, rawDiff: 800, percDiff: 2, score: 1 },
      ],
    };
    const normalized = await qeliveProvider.parse(raw);
    expect(normalized.baselineOutput).toBeCloseTo(40000, 5);
  });

  it("usa la mediana entre varias filas para amortiguar el redondeo de percDiff", async () => {
    const raw = {
      playername: "Lyra",
      results: [
        { item: 300, dropLoc: "Raid", dropDifficulty: 6, level: 285, rawDiff: 1800, percDiff: 4.52, score: 1 },
        { item: 301, dropLoc: "Raid", dropDifficulty: 6, level: 285, rawDiff: 1800, percDiff: 4.5, score: 1 },
        { item: 302, dropLoc: "Raid", dropDifficulty: 6, level: 285, rawDiff: 1800, percDiff: 4.48, score: 1 },
      ],
    };
    const normalized = await qeliveProvider.parse(raw);
    expect(normalized.baselineOutput).toBeCloseTo(40000, 0);
  });

  it("no revienta y devuelve baselineOutput null si ninguna fila tiene percDiff distinto de 0", async () => {
    const raw = {
      playername: "Lyra",
      results: [{ item: 300, dropLoc: "Raid", dropDifficulty: 6, level: 285, rawDiff: 0, percDiff: 0, score: 0 }],
    };
    const normalized = await qeliveProvider.parse(raw);
    expect(normalized.baselineOutput).toBeNull();
  });

  it("baselineOutput es null cuando no hay ningún resultado", async () => {
    const normalized = await qeliveProvider.parse({ playername: "Lyra", results: [] });
    expect(normalized.baselineOutput).toBeNull();
  });
});
