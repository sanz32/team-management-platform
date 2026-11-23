import { describe, expect, it } from "vitest";
import {
  extractFightId,
  foldRealmForMatch,
  matchActorsToCharacters,
  normalizeName,
  parseWclFightLink,
  type GuildCharacterRef,
  type WclActor,
} from "@/lib/wcl";

function actor(name: string, server: string | null, gameId: number | null = null): WclActor {
  return { name, server, subType: null, gameId };
}

function character(id: string, name: string, realm_slug: string, blizzard_character_id?: number | null): GuildCharacterRef {
  return { id, name, realm_slug, blizzard_character_id };
}

describe("normalizeName / foldRealmForMatch", () => {
  it("pela acentos, apostrofes y mayusculas para comparar nombres", () => {
    expect(normalizeName("Nërÿ")).toBe("nery");
    expect(normalizeName("Nèrý")).toBe("nery");
    expect(normalizeName("Nérý")).toBe("nery");
    expect(normalizeName("Zul'jin")).toBe("zuljin");
  });

  it("plega reino a alfanumerico sin importar el separador", () => {
    expect(foldRealmForMatch("Area 52")).toBe("area52");
    expect(foldRealmForMatch("Area52")).toBe("area52");
    expect(foldRealmForMatch("area-52")).toBe("area52");
  });
});

describe("matchActorsToCharacters", () => {
  it("matchea primero por blizzard_character_id, sin importar el nombre", () => {
    const characters = [character("char-1", "NombreViejo", "stormrage", 12345)];
    const actors = [actor("NombreNuevo", "Stormrage", 12345)];

    const { matchedIds, stats } = matchActorsToCharacters(actors, characters);

    expect(matchedIds.has("char-1")).toBe(true);
    expect(stats.byGameId).toBe(1);
    expect(stats.byExactName).toBe(0);
  });

  it("cae a nombre exacto + reino plegado cuando no hay id (o no matchea)", () => {
    const characters = [character("char-1", "Nery", "area-52")];
    const actors = [actor("Nery", "Area52")];

    const { matchedIds, stats } = matchActorsToCharacters(actors, characters);

    expect(matchedIds.has("char-1")).toBe(true);
    expect(stats.byExactName).toBe(1);
  });

  it("no confunde dos personajes del mismo dueno con acentos distintos (bug real de produccion)", () => {
    const characters = [
      character("char-neryacento1", "Nèry", "stormrage"),
      character("char-neryacento2", "Nërÿ", "stormrage"),
    ];
    const actors = [actor("Nërÿ", "Stormrage")];

    const { matchedIds, stats } = matchActorsToCharacters(actors, characters);

    expect(matchedIds.has("char-neryacento2")).toBe(true);
    expect(matchedIds.has("char-neryacento1")).toBe(false);
    expect(stats.byExactName).toBe(1);
    expect(stats.byFoldedName).toBe(0);
  });

  it("si de verdad colisiona en el respaldo plegado, acredita a TODOS los que colisionan", () => {
    const characters = [
      character("char-a", "Nèry", "ragnaros"),
      character("char-b", "Nëry", "ragnaros"),
    ];
    const actors = [actor("Nery", "Ragnaros")];

    const { matchedIds, stats } = matchActorsToCharacters(actors, characters);

    expect(matchedIds.has("char-a")).toBe(true);
    expect(matchedIds.has("char-b")).toBe(true);
    expect(stats.byFoldedName).toBe(1);
    expect(stats.unmatched).toBe(0);
  });

  it("marca unmatched cuando ningun camino resuelve al actor", () => {
    const characters = [character("char-1", "Otronombre", "stormrage")];
    const actors = [actor("Desconocido", "Stormrage")];

    const { matchedIds, unknownActors, stats } = matchActorsToCharacters(actors, characters);

    expect(matchedIds.size).toBe(0);
    expect(unknownActors).toHaveLength(1);
    expect(stats.unmatched).toBe(1);
  });

  it("actor sin server (WCL no lo resolvio) siempre va a unmatched", () => {
    const characters = [character("char-1", "Alguien", "stormrage")];
    const actors = [actor("Alguien", null)];

    const { matchedIds, stats } = matchActorsToCharacters(actors, characters);

    expect(matchedIds.size).toBe(0);
    expect(stats.unmatched).toBe(1);
  });
});

describe("extractFightId / parseWclFightLink", () => {
  it("lee el id del pull del ancla #fight=", () => {
    expect(extractFightId("https://www.warcraftlogs.com/reports/AbCdEfGh#fight=12")).toBe(12);
  });

  it("lee el id aunque el ancla traiga mas parametros despues", () => {
    expect(
      extractFightId("https://www.warcraftlogs.com/reports/AbCdEfGh#fight=12&type=damage-done")
    ).toBe(12);
    expect(
      extractFightId("https://www.warcraftlogs.com/reports/AbCdEfGh#type=damage-done&fight=7")
    ).toBe(7);
  });

  it("lee el id cuando viene como query string (?fight=) en vez de ancla", () => {
    expect(extractFightId("https://www.warcraftlogs.com/reports/AbCdEfGh?fight=12")).toBe(12);
    expect(
      extractFightId("https://www.warcraftlogs.com/reports/AbCdEfGh?fight=12&type=damage-done")
    ).toBe(12);
  });

  it("devuelve null si el link no señala ningun pull", () => {
    expect(extractFightId("https://www.warcraftlogs.com/reports/AbCdEfGh")).toBeNull();
    expect(extractFightId("https://www.warcraftlogs.com/reports/AbCdEfGh#fight=last")).toBeNull();
  });

  it("parseWclFightLink devuelve las dos partes juntas", () => {
    expect(parseWclFightLink("https://www.warcraftlogs.com/reports/AbCdEfGh#fight=3")).toEqual({
      reportCode: "AbCdEfGh",
      fightId: 3,
    });
  });

  it("un host que no es Warcraft Logs no da codigo de reporte", () => {
    const parsed = parseWclFightLink("https://ejemplo.com/reports/AbCdEfGh#fight=3");
    expect(parsed.reportCode).toBeNull();
    expect(parsed.fightId).toBe(3);
  });
});
