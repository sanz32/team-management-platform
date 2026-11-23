import { describe, it, expect } from "vitest";
import {
  CURRENT_SEASON_DUNGEON_POOL,
  resolveSeasonDungeons,
} from "./season-dungeon-pool";
import { formatKeystone } from "./sync-display";

describe("resolveSeasonDungeons", () => {
  it("devuelve el pool completo, en su orden, aunque no haya llave", () => {
    const dungeons = resolveSeasonDungeons(null);

    expect(dungeons.map((d) => d.challengeModeID)).toEqual(CURRENT_SEASON_DUNGEON_POOL);
    expect(dungeons.every((d) => d.status === "no-data")).toBe(true);
    expect(dungeons.every((d) => d.keystoneLevel === null)).toBe(true);
  });

  it("marca la mazmorra de la llave en bolsa y deja el resto sin datos", () => {
    const dungeons = resolveSeasonDungeons({ level: 12, challengeModeID: 588, mapId: 2993 });

    const owned = dungeons.filter((d) => d.status === "keystone");
    expect(owned).toHaveLength(1);
    expect(owned[0].challengeModeID).toBe(588);
    expect(owned[0].name).toBe("Altar of Fangs");
    expect(owned[0].keystoneLevel).toBe(12);
    expect(dungeons.filter((d) => d.status === "no-data")).toHaveLength(
      CURRENT_SEASON_DUNGEON_POOL.length - 1
    );
  });

  it("resuelve la llave por mapId cuando el addon no pudo leer el challengeModeID", () => {
    const dungeons = resolveSeasonDungeons({ level: 7, mapId: 2859 });

    const owned = dungeons.find((d) => d.status === "keystone");
    expect(owned?.challengeModeID).toBe(584);
    expect(owned?.keystoneLevel).toBe(7);
  });

  it("no marca nada si la llave es de una mazmorra fuera del pool vigente", () => {
    const dungeons = resolveSeasonDungeons({ level: 15, challengeModeID: 402, mapId: 2526 });

    expect(dungeons.every((d) => d.status === "no-data")).toBe(true);
  });

  it("trata como sin llave una tabla Lua vacía o un nivel inválido", () => {
    for (const empty of [[], {}, { level: 0 }, { level: -3 }, "nada", undefined]) {
      expect(resolveSeasonDungeons(empty).every((d) => d.status === "no-data")).toBe(true);
    }
  });

  it("no explota con un challengeModeID que la tabla de mazmorras no conoce", () => {
    const dungeons = resolveSeasonDungeons({ level: 5, challengeModeID: 999999 }, [999999, 588]);

    expect(dungeons[0]).toEqual({
      challengeModeID: 999999,
      name: "Mazmorra 999999",
      abbr: "??",
      status: "keystone",
      keystoneLevel: 5,
    });
    expect(dungeons[1].status).toBe("no-data");
  });

  it("el pool vigente tiene 8 mazmorras, todas conocidas y sin repetir", () => {
    expect(CURRENT_SEASON_DUNGEON_POOL).toHaveLength(8);
    expect(new Set(CURRENT_SEASON_DUNGEON_POOL).size).toBe(8);
    expect(resolveSeasonDungeons(null).every((d) => d.abbr !== "??")).toBe(true);
  });
});

describe("resolveSeasonDungeons con datos semanales de GG", () => {
  it("marca 'completed' la mazmorra con nivel real de esta semana, con su score", () => {
    const dungeons = resolveSeasonDungeons(null, undefined, [
      { challengeModeID: 588, level: 10, score: 165.3, finishedSuccess: true },
    ]);

    const completed = dungeons.find((d) => d.challengeModeID === 588);
    expect(completed?.status).toBe("completed");
    expect(completed?.keystoneLevel).toBe(10);
    expect(completed?.weeklyScore).toBe(165.3);
    expect(dungeons.filter((d) => d.status === "completed")).toHaveLength(1);
  });

  it("prioriza el dato semanal por sobre la llave en bolsa cuando es la misma mazmorra", () => {
    const dungeons = resolveSeasonDungeons(
      { level: 7, challengeModeID: 588, mapId: 2993 },
      undefined,
      [{ challengeModeID: 588, level: 10, score: 165.3, finishedSuccess: true }]
    );

    const dungeon = dungeons.find((d) => d.challengeModeID === 588);
    expect(dungeon?.status).toBe("completed");
    expect(dungeon?.keystoneLevel).toBe(10);
  });

  it("ignora una entrada semanal con level 0 (sin llave activa esa mazmorra todavía)", () => {
    const dungeons = resolveSeasonDungeons(null, undefined, [
      { challengeModeID: 588, level: 0, score: 0, finishedSuccess: false },
    ]);

    expect(dungeons.find((d) => d.challengeModeID === 588)?.status).toBe("no-data");
  });

  it("sin array semanal (personaje que sincroniza por AlterEgo) se comporta igual que antes", () => {
    const withUndefined = resolveSeasonDungeons({ level: 12, challengeModeID: 588, mapId: 2993 });
    const withNull = resolveSeasonDungeons(
      { level: 12, challengeModeID: 588, mapId: 2993 },
      undefined,
      null
    );

    expect(withUndefined).toEqual(withNull);
    expect(withNull.find((d) => d.challengeModeID === 588)?.status).toBe("keystone");
  });
});

describe("formatKeystone tras extraer parseKeystoneRaw", () => {
  it("mantiene sigla y nombre completo cuando la mazmorra se conoce", () => {
    expect(formatKeystone({ level: 12, challengeModeID: 588, mapId: 2993 })).toEqual({
      short: "AOF +12",
      full: "Altar of Fangs +12",
    });
  });

  it("cae al nivel pelado cuando la mazmorra no se conoce", () => {
    expect(formatKeystone({ level: 9, challengeModeID: 999999 })).toEqual({
      short: "+9",
      full: "+9",
    });
  });

  it("devuelve null sin llave real", () => {
    expect(formatKeystone([])).toBeNull();
    expect(formatKeystone({})).toBeNull();
    expect(formatKeystone({ level: 0 })).toBeNull();
    expect(formatKeystone(null)).toBeNull();
  });
});
