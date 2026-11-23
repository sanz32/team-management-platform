import { describe, expect, it } from "vitest";
import { matchCharacter, canImportForCharacter, type CharacterRow } from "./import";

function char(overrides: Partial<CharacterRow> & Pick<CharacterRow, "id" | "name">): CharacterRow {
  return {
    user_id: "user-1",
    realm_slug: "area-52",
    realm_name: "Area 52",
    role: "dps",
    class: "Mage",
    region: "us",
    ...overrides,
  };
}

describe("matchCharacter", () => {
  it("matchea por nombre exacto + reino plegado", () => {
    const characters = [char({ id: "c1", name: "Ember", realm_name: "Area 52" })];
    const match = matchCharacter(characters, "Ember", "Area52");
    expect(match?.id).toBe("c1");
  });

  it("cae a nombre plegado (sin acentos) cuando el exacto no matchea", () => {
    const characters = [char({ id: "c1", name: "Nërÿ", realm_name: "Stormrage" })];
    const match = matchCharacter(characters, "Nery", "Stormrage");
    expect(match?.id).toBe("c1");
  });

  it("no confunde personajes de reinos distintos con el mismo nombre plegado", () => {
    const characters = [
      char({ id: "c1", name: "Ember", realm_name: "Area 52" }),
      char({ id: "c2", name: "Ember", realm_name: "Stormrage" }),
    ];
    const match = matchCharacter(characters, "Ember", "Area 52");
    expect(match?.id).toBe("c1");
  });

  it("sin reino en el sim, solo matchea si el nombre es unico en todo el roster", () => {
    const characters = [
      char({ id: "c1", name: "Ember", realm_name: "Area 52" }),
      char({ id: "c2", name: "Ember", realm_name: "Stormrage" }),
    ];
    expect(matchCharacter(characters, "Ember", null)).toBeNull();

    const uniqueRoster = [char({ id: "c1", name: "Ember", realm_name: "Area 52" })];
    expect(matchCharacter(uniqueRoster, "Ember", null)?.id).toBe("c1");
  });

  it("devuelve null si no encuentra ningun personaje con ese nombre", () => {
    const characters = [char({ id: "c1", name: "Ember", realm_name: "Area 52" })];
    expect(matchCharacter(characters, "Desconocido", "Area 52")).toBeNull();
  });

  it("usa realm_slug como respaldo si realm_name es null", () => {
    const characters = [char({ id: "c1", name: "Ember", realm_name: null, realm_slug: "area-52" })];
    expect(matchCharacter(characters, "Ember", "Area 52")?.id).toBe("c1");
  });
});

describe("canImportForCharacter", () => {
  it("permite al dueño importar su propio personaje", () => {
    expect(canImportForCharacter({ user_id: "user-1" }, "user-1", false)).toBe(true);
  });

  it("rechaza a alguien que no es dueño ni admin", () => {
    expect(canImportForCharacter({ user_id: "user-1" }, "user-2", false)).toBe(false);
  });

  it("permite a admin importar el personaje de otro (para testear)", () => {
    expect(canImportForCharacter({ user_id: "user-1" }, "user-2", true)).toBe(true);
  });

  it("un admin sigue pudiendo importar sus propios personajes", () => {
    expect(canImportForCharacter({ user_id: "user-1" }, "user-1", true)).toBe(true);
  });
});
