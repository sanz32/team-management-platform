import { describe, expect, it } from "vitest";
import { raidbotsProvider } from "./raidbots";

describe("raidbotsProvider.detect", () => {
  it("reconoce cualquier link de raidbots.com", () => {
    expect(raidbotsProvider.detect("https://www.raidbots.com/simbot/report/Xk3pQ9TestReport0000001")).toBe(true);
    expect(raidbotsProvider.detect("https://questionablyepic.com/live/upgradereport/abcdefghijkl")).toBe(false);
  });
});

describe("raidbotsProvider.extractId", () => {
  it("extrae el id de un link de simbot/report", () => {
    expect(raidbotsProvider.extractId("https://www.raidbots.com/simbot/report/Xk3pQ9TestReport0000001")).toBe(
      "Xk3pQ9TestReport0000001"
    );
  });

  it("extrae el id de un link de /reports (formato alternativo)", () => {
    expect(raidbotsProvider.extractId("https://www.raidbots.com/reports/3KfRVLXkSay5NLExPg5wow/data.json")).toBe(
      "3KfRVLXkSay5NLExPg5wow"
    );
  });

  it("acepta un id pelado, sin link", () => {
    expect(raidbotsProvider.extractId("sXG8jQ24ow2wUAG9kweUWx")).toBe("sXG8jQ24ow2wUAG9kweUWx");
  });
});

function buildRawJson(overrides: { metric?: string; results?: unknown[]; droptimizerItems?: unknown[] } = {}) {
  return {
    sim: {
      profilesets: {
        metric: overrides.metric ?? "dps",
        results:
          overrides.results ??
          [
            { name: "item-1", mean: 105000 },
            { name: "item-2-variant-a", mean: 108000 },
            { name: "item-2-variant-b", mean: 106000 },
            { name: "item-1-heroic", mean: 103000 },
            { name: "item-lfr", mean: 101000 },
          ],
      },
      players: [{ name: "Ember", specialization: "Fire", collected_data: { dps: { mean: 100000 } } }],
    },
    simbot: {
      player: "Ember",
      spec: "Fire",
      fightStyle: "Patchwerk",
      meta: {
        rawFormData: {
          character: { name: "Ember", realm: "Area 52" },
          droptimizerItems:
            overrides.droptimizerItems ??
            [
              {
                id: "item-1",
                slot: "head",
                item: {
                  id: 111,
                  name: "Casco de prueba",
                  icon: "inv_helmet_test",
                  itemLevel: 285,
                  difficulty: "raid-mythic",
                  encounter: { id: 2711, name: "Rotmire" },
                  instance: { id: 1305, name: "Sporefall" },
                },
              },
              {
                id: "item-2-variant-a",
                slot: "trinket1",
                item: {
                  id: 222,
                  name: "Trinket de prueba",
                  icon: "inv_trinket_test",
                  itemLevel: 285,
                  difficulty: "raid-mythic",
                  encounter: { id: 2733, name: "Imperator Averzian" },
                  instance: { id: 1307, name: "The Voidspire" },
                  tags: ["catalyst"],
                },
              },
              {
                id: "item-2-variant-b",
                slot: "trinket1",
                item: {
                  id: 222,
                  name: "Trinket de prueba",
                  icon: "inv_trinket_test",
                  itemLevel: 285,
                  difficulty: "raid-mythic",
                  encounter: { id: 2733, name: "Imperator Averzian" },
                  instance: { id: 1307, name: "The Voidspire" },
                  tags: ["catalyst"],
                },
              },
              {
                id: "item-1-heroic",
                slot: "head",
                item: {
                  id: 111,
                  name: "Casco de prueba",
                  icon: "inv_helmet_test",
                  itemLevel: 272,
                  difficulty: "raid-heroic",
                  encounter: { id: 2711, name: "Rotmire" },
                  instance: { id: 1305, name: "Sporefall" },
                },
              },
              {
                id: "item-lfr",
                slot: "feet",
                item: {
                  id: 333,
                  name: "Item de LFR (debe descartarse)",
                  icon: "inv_boots_test",
                  itemLevel: 259,
                  difficulty: "raid-lfr",
                  encounter: { id: 2711, name: "Rotmire" },
                  instance: { id: 1305, name: "Sporefall" },
                },
              },
            ],
        },
      },
    },
  };
}

describe("raidbotsProvider.parse", () => {
  it("calcula upgrade_pct/absolute contra el baseline del jugador", async () => {
    const result = await raidbotsProvider.parse(buildRawJson());
    const casco = result.upgrades.find((u) => u.itemId === 111)!;

    expect(casco.upgradeAbsolute).toBe(5000);
    expect(casco.upgradePct).toBeCloseTo(5, 5);
    expect(casco.bossExternalName).toBe("Rotmire");
    expect(casco.iconNameHint).toBe("inv_helmet_test");
    expect(casco.source).toBe("boss");
    expect(casco.difficulty).toBe("mythic");
  });

  it("mantiene Heroico y Mítico del MISMO item como filas separadas", async () => {
    const result = await raidbotsProvider.parse(buildRawJson());
    const cascos = result.upgrades.filter((u) => u.itemId === 111);

    expect(cascos).toHaveLength(2);
    expect(cascos.find((c) => c.difficulty === "mythic")?.ilvl).toBe(285);
    expect(cascos.find((c) => c.difficulty === "heroic")?.ilvl).toBe(272);
  });

  it("descarta items de LFR (este guild no raidea Buscador de Banda)", async () => {
    const result = await raidbotsProvider.parse(buildRawJson());
    expect(result.upgrades.some((u) => u.itemId === 333)).toBe(false);
  });

  it("dedupea por item.id quedandose con el mean mas alto entre variantes", async () => {
    const result = await raidbotsProvider.parse(buildRawJson());
    const trinkets = result.upgrades.filter((u) => u.itemId === 222);

    expect(trinkets).toHaveLength(1);
    expect(trinkets[0].upgradeAbsolute).toBe(8000);
  });

  it("marca catalyst como source cuando el item trae ese tag", async () => {
    const result = await raidbotsProvider.parse(buildRawJson());
    const trinket = result.upgrades.find((u) => u.itemId === 222)!;
    expect(trinket.source).toBe("catalyst");
  });

  it("extrae nombre/reino/spec/fightStyle del personaje simulado", async () => {
    const result = await raidbotsProvider.parse(buildRawJson());
    expect(result.characterName).toBe("Ember");
    expect(result.realmName).toBe("Area 52");
    expect(result.spec).toBe("Fire");
    expect(result.fightStyle).toBe("Patchwerk");
  });

  it("rechaza un reporte que no es Droptimizer", async () => {
    const raw = buildRawJson();
    // @ts-expect-error -- se borra a propósito para simular un sim que no es Droptimizer
    delete raw.simbot.meta.rawFormData.droptimizerItems;
    await expect(raidbotsProvider.parse(raw)).rejects.toThrow(/no es un Droptimizer/);
  });

  it("rechaza un reporte de sanador (metric hps)", async () => {
    const raw = buildRawJson({ metric: "hps" });
    await expect(raidbotsProvider.parse(raw)).rejects.toThrow(/sanador/);
  });

  it("cae al dps.mean del jugador como baselineOutput si no hay profileset 'Baseline'", async () => {
    const result = await raidbotsProvider.parse(buildRawJson());
    expect(result.baselineOutput).toBe(100000);
  });

  it("usa el profileset 'Baseline' como baselineOutput cuando existe", async () => {
    const raw = buildRawJson({
      results: [{ name: "Baseline", mean: 99500 }, { name: "item-1", mean: 105000 }],
    });
    const result = await raidbotsProvider.parse(raw);
    expect(result.baselineOutput).toBe(99500);
  });
});
