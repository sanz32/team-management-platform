import { describe, it, expect } from "vitest";
import { characterBossProgressByRaid } from "./character-boss-progress";
import type { Difficulty, RaidDef } from "./raids";

function raid(overrides: Partial<RaidDef> & Pick<RaidDef, "key">): RaidDef {
  return {
    name: overrides.key,
    abbr: overrides.key.slice(0, 2).toUpperCase(),
    colorClass: "text-lime-400",
    color: "#a3e635",
    bosses: [],
    blizzardInstanceName: null,
    difficulties: ["normal", "heroic", "mythic"] as Difficulty[],
    lockoutSource: "blizzard",
    forceWclManualRefresh: false,
    headerImageUrl: null,
    ...overrides,
  };
}

function bosses(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    name: `Jefe ${i + 1}`,
    imageUrl: i === 0 ? "https://example.test/jefe-1.png" : null,
  }));
}

describe("characterBossProgressByRaid", () => {
  it("mezcla jefes matados y pendientes en las tres dificultades", () => {
    const abyss = raid({ key: "venomous_abyss", bosses: bosses(3) });
    const progress = characterBossProgressByRaid(
      {
        kills: [
          "venomous_abyss-normal-1",
          "venomous_abyss-normal-2",
          "venomous_abyss-heroic-1",
        ],
      },
      [abyss]
    );

    expect(progress).toHaveLength(1);
    expect(progress[0].raid.key).toBe("venomous_abyss");
    expect(progress[0].difficulties.map((d) => d.difficulty)).toEqual([
      "normal",
      "heroic",
      "mythic",
    ]);

    const [normal, heroic, mythic] = progress[0].difficulties;
    expect(normal.killedCount).toBe(2);
    expect(normal.totalCount).toBe(3);
    expect(normal.bosses.map((b) => b.killed)).toEqual([true, true, false]);
    expect(heroic.killedCount).toBe(1);
    expect(heroic.bosses.map((b) => b.killed)).toEqual([true, false, false]);
    expect(mythic.killedCount).toBe(0);
    expect(mythic.bosses.map((b) => b.killed)).toEqual([false, false, false]);
  });

  it("conserva bossIndex 1-based, nombre e imagen de cada jefe", () => {
    const grotto = raid({ key: "tidebound_grotto", bosses: bosses(2) });
    const [entry] = characterBossProgressByRaid({ kills: [] }, [grotto]);

    expect(entry.difficulties[0].bosses).toEqual([
      {
        bossIndex: 1,
        name: "Jefe 1",
        imageUrl: "https://example.test/jefe-1.png",
        killed: false,
      },
      { bossIndex: 2, name: "Jefe 2", imageUrl: null, killed: false },
    ]);
  });

  it("filtra la fila de una dificultad que la raid no tiene", () => {
    const soloHeroico = raid({
      key: "solo_heroico",
      bosses: bosses(2),
      difficulties: ["heroic", "world"],
    });
    const [entry] = characterBossProgressByRaid({ kills: [] }, [soloHeroico]);

    expect(entry.difficulties.map((d) => d.difficulty)).toEqual(["heroic"]);
  });

  it("descarta la raid entera si ninguna de las dificultades pedidas existe ahí", () => {
    const soloMundo = raid({
      key: "solo_mundo",
      bosses: bosses(1),
      difficulties: ["world"],
    });

    expect(characterBossProgressByRaid({ kills: [] }, [soloMundo])).toEqual([]);
  });

  it("un personaje sin kills tiene todo en false", () => {
    const abyss = raid({ key: "venomous_abyss", bosses: bosses(4) });
    const [entry] = characterBossProgressByRaid({ kills: [] }, [abyss]);

    for (const row of entry.difficulties) {
      expect(row.killedCount).toBe(0);
      expect(row.totalCount).toBe(4);
      expect(row.bosses.every((b) => !b.killed)).toBe(true);
    }
  });

  it("descarta una raid sin jefes cargados", () => {
    const vacia = raid({ key: "sin_jefes", bosses: [] });
    const conJefes = raid({ key: "con_jefes", bosses: bosses(1) });

    const progress = characterBossProgressByRaid({ kills: [] }, [vacia, conJefes]);
    expect(progress.map((p) => p.raid.key)).toEqual(["con_jefes"]);
  });

  it("respeta la lista de dificultades que se le pasa", () => {
    const abyss = raid({ key: "venomous_abyss", bosses: bosses(2) });
    const [entry] = characterBossProgressByRaid(
      { kills: ["venomous_abyss-mythic-1"] },
      [abyss],
      ["mythic"]
    );

    expect(entry.difficulties).toHaveLength(1);
    expect(entry.difficulties[0].difficulty).toBe("mythic");
    expect(entry.difficulties[0].killedCount).toBe(1);
  });

  it("no confunde los kills de una raid con los de otra", () => {
    const a = raid({ key: "abyss", bosses: bosses(2) });
    const b = raid({ key: "abyss_lair", bosses: bosses(2) });

    const progress = characterBossProgressByRaid({ kills: ["abyss_lair-normal-1"] }, [a, b]);

    expect(progress[0].difficulties[0].killedCount).toBe(0);
    expect(progress[1].difficulties[0].killedCount).toBe(1);
  });
});
