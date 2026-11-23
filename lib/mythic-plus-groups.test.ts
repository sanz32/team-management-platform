import { describe, expect, it } from "vitest";
import {
  buildLeaderboard,
  computeIndividualCounts,
  computeMatchedCount,
  filterRunsByPeriod,
  isFullMatch,
  MIN_MATCH_TO_STORE,
  type MythicPlusGroupRun,
  type MythicPlusRunRosterEntry,
} from "@/lib/mythic-plus-groups";

function run(overrides: Partial<MythicPlusGroupRun> & { id: string }): MythicPlusGroupRun {
  return {
    groupId: "g1",
    source: "wcl",
    sourceRunId: overrides.id,
    dungeonName: "Ara-Kara, City of Echoes",
    keystoneLevel: 10,
    keystoneUpgrades: 2,
    clearTimeMs: 1_200_000,
    completedAt: "2026-08-08T12:00:00.000Z",
    matchedCount: 5,
    roster: [],
    avgIlvl: 680,
    ...overrides,
  };
}

function rosterEntry(userId: string, overrides: Partial<MythicPlusRunRosterEntry> = {}): MythicPlusRunRosterEntry {
  return {
    userId,
    displayName: userId,
    characterName: `Char-${userId}`,
    characterClass: "Mage",
    realm: "r",
    itemLevel: 680,
    ...overrides,
  };
}

describe("computeMatchedCount", () => {
  it("cuenta solo los usuarios del roster que pertenecen al grupo", () => {
    const group = new Set(["a", "b", "c", "d", "e"]);
    expect(computeMatchedCount(["a", "b", "x", "y"], group)).toBe(2);
  });

  it("ignora entradas sin userId (participante no matcheado)", () => {
    const group = new Set(["a", "b"]);
    expect(computeMatchedCount(["a", null, "b"], group)).toBe(2);
  });

  it("da 0 si ninguno del roster pertenece al grupo", () => {
    expect(computeMatchedCount(["x", "y"], new Set(["a", "b"]))).toBe(0);
  });
});

describe("isFullMatch", () => {
  it("5 de 5 es match completo", () => {
    expect(isFullMatch({ matchedCount: 5 })).toBe(true);
  });

  it("4 de 5 NO es match completo", () => {
    expect(isFullMatch({ matchedCount: 4 })).toBe(false);
  });
});

describe("MIN_MATCH_TO_STORE", () => {
  it("es 1 -- incluso una sola coincidencia se guarda, para que el contador individual del usuario cuente TODA su actividad", () => {
    expect(MIN_MATCH_TO_STORE).toBe(1);
  });
});

describe("filterRunsByPeriod", () => {
  const now = new Date("2026-08-08T12:00:00.000Z");

  it("dia: descarta miticas de mas de 24h atras", () => {
    const runs = [
      run({ id: "reciente", completedAt: "2026-08-08T10:00:00.000Z" }),
      run({ id: "vieja", completedAt: "2026-08-06T10:00:00.000Z" }),
    ];
    const result = filterRunsByPeriod(runs, "day", now);
    expect(result.map((r) => r.sourceRunId)).toEqual(["reciente"]);
  });

  it("semana: incluye una mitica de 5 dias pero descarta una de 10", () => {
    const runs = [
      run({ id: "hace5dias", completedAt: "2026-08-03T12:00:00.000Z" }),
      run({ id: "hace10dias", completedAt: "2026-07-29T12:00:00.000Z" }),
    ];
    const result = filterRunsByPeriod(runs, "week", now);
    expect(result.map((r) => r.sourceRunId)).toEqual(["hace5dias"]);
  });
});

describe("buildLeaderboard", () => {
  it("ordena por miticas confirmadas (todo el grupo junto), no por miticas totales", () => {
    const runsByGroup = new Map<string, MythicPlusGroupRun[]>([
      [
        "menos-confirmadas-mas-parciales",
        [
          run({ id: "1", groupId: "menos-confirmadas-mas-parciales", matchedCount: 5 }),
          run({ id: "2", groupId: "menos-confirmadas-mas-parciales", matchedCount: 3 }),
          run({ id: "3", groupId: "menos-confirmadas-mas-parciales", matchedCount: 3 }),
          run({ id: "4", groupId: "menos-confirmadas-mas-parciales", matchedCount: 3 }),
        ],
      ],
      [
        "mas-confirmadas",
        [
          run({ id: "5", groupId: "mas-confirmadas", matchedCount: 5 }),
          run({ id: "6", groupId: "mas-confirmadas", matchedCount: 5 }),
        ],
      ],
    ]);

    const leaderboard = buildLeaderboard(["menos-confirmadas-mas-parciales", "mas-confirmadas"], runsByGroup);

    expect(leaderboard[0].groupId).toBe("mas-confirmadas");
    expect(leaderboard[0].confirmedCount).toBe(2);
    expect(leaderboard[1].groupId).toBe("menos-confirmadas-mas-parciales");
    expect(leaderboard[1].confirmedCount).toBe(1);
    expect(leaderboard[1].partialCount).toBe(3);
  });

  it("promedia nivel/tiempo/ilvl solo sobre las miticas confirmadas (grupo completo)", () => {
    const runsByGroup = new Map<string, MythicPlusGroupRun[]>([
      [
        "g1",
        [
          run({ id: "1", matchedCount: 5, keystoneLevel: 10, clearTimeMs: 1_000_000, avgIlvl: 670 }),
          run({ id: "2", matchedCount: 5, keystoneLevel: 20, clearTimeMs: 2_000_000, avgIlvl: 690 }),
          run({ id: "3", matchedCount: 3, keystoneLevel: 99, clearTimeMs: 9_999_999, avgIlvl: 999 }),
        ],
      ],
    ]);

    const [entry] = buildLeaderboard(["g1"], runsByGroup);
    expect(entry.avgKeystoneLevel).toBe(15);
    expect(entry.avgClearTimeMs).toBe(1_500_000);
    expect(entry.avgIlvl).toBe(680);
  });

  it("un grupo sin miticas confirmadas da promedios null, no NaN", () => {
    const runsByGroup = new Map<string, MythicPlusGroupRun[]>([["g1", [run({ id: "1", matchedCount: 2 })]]]);
    const [entry] = buildLeaderboard(["g1"], runsByGroup);
    expect(entry.confirmedCount).toBe(0);
    expect(entry.avgKeystoneLevel).toBeNull();
    expect(entry.avgClearTimeMs).toBeNull();
    expect(entry.avgIlvl).toBeNull();
  });

  it("desglosa las confirmadas por nivel, +2 a +9 individual y 10+ agrupado, en orden ascendente", () => {
    const runsByGroup = new Map<string, MythicPlusGroupRun[]>([
      [
        "g1",
        [
          run({ id: "1", matchedCount: 5, keystoneLevel: 12 }),
          run({ id: "2", matchedCount: 5, keystoneLevel: 10 }),
          run({ id: "3", matchedCount: 5, keystoneLevel: 5 }),
          run({ id: "4", matchedCount: 5, keystoneLevel: 5 }),
          run({ id: "5", matchedCount: 5, keystoneLevel: 5 }),
          run({ id: "6", matchedCount: 3, keystoneLevel: 20 }),
        ],
      ],
    ]);

    const [entry] = buildLeaderboard(["g1"], runsByGroup);
    expect(entry.levelBreakdown).toEqual([
      { label: "+5", count: 3 },
      { label: "10+", count: 2 },
    ]);
  });

  it("un nivel sin ninguna mitica no aparece en el desglose", () => {
    const runsByGroup = new Map<string, MythicPlusGroupRun[]>([
      ["g1", [run({ id: "1", matchedCount: 5, keystoneLevel: 2 })]],
    ]);
    const [entry] = buildLeaderboard(["g1"], runsByGroup);
    expect(entry.levelBreakdown).toEqual([{ label: "+2", count: 1 }]);
  });
});

describe("computeIndividualCounts", () => {
  it("cuenta en cuantas miticas guardadas aparece cada usuario, incluidas parciales", () => {
    const runs: MythicPlusGroupRun[] = [
      run({ id: "1", matchedCount: 5, roster: [rosterEntry("a"), rosterEntry("b")] }),
      run({ id: "2", matchedCount: 2, roster: [rosterEntry("a")] }),
    ];

    const counts = computeIndividualCounts(["a", "b", "c"], runs);
    expect(counts.get("a")).toBe(2);
    expect(counts.get("b")).toBe(1);
    expect(counts.get("c")).toBe(0);
  });

  it("ignora en el roster a alguien que no pertenece al grupo (pug de relleno)", () => {
    const runs: MythicPlusGroupRun[] = [run({ id: "1", roster: [rosterEntry("pug-ajeno")] })];
    const counts = computeIndividualCounts(["a", "b"], runs);
    expect(counts.get("a")).toBe(0);
    expect(counts.get("b")).toBe(0);
  });

  it("el contador individual de un usuario cuenta TODA su actividad aunque el grupo tenga menos en común (caso real pedido por el usuario: 14 individuales, 10 de grupo)", () => {
    const grupoCompleto = Array.from({ length: 10 }, (_, i) =>
      run({
        id: `full-${i}`,
        matchedCount: 5,
        roster: [rosterEntry("a"), rosterEntry("b"), rosterEntry("c"), rosterEntry("d"), rosterEntry("e")],
      })
    );
    const soloA = Array.from({ length: 4 }, (_, i) => run({ id: `solo-${i}`, matchedCount: 1, roster: [rosterEntry("a")] }));
    const runs = [...grupoCompleto, ...soloA];

    const [entry] = buildLeaderboard(["g1"], new Map([["g1", runs]]));
    expect(entry.confirmedCount).toBe(10);

    const individualCounts = computeIndividualCounts(["a", "b", "c", "d", "e"], runs);
    expect(individualCounts.get("a")).toBe(14);
    expect(individualCounts.get("b")).toBe(10);
  });
});
