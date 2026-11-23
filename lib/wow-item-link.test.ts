import { describe, it, expect } from "vitest";
import { parseItemLink, qualityNameFromIndex, wowheadParamsForItemLink } from "./wow-item-link";

const REAL_LINK =
  "|cnIQ4:|Hitem:268203::::::::90:105::95:2:13334:12849::::::|h[Hexing Spiritrender]|h|r";

describe("parseItemLink", () => {
  it("extrae itemId, nombre, calidad y bonusIds de un link real", () => {
    const parsed = parseItemLink(REAL_LINK);
    expect(parsed).toEqual({
      itemId: 268203,
      bonusIds: [13334, 12849],
      name: "Hexing Spiritrender",
      qualityIndex: 4,
    });
  });

  it("devuelve null para null/undefined/vacío", () => {
    expect(parseItemLink(null)).toBeNull();
    expect(parseItemLink(undefined)).toBeNull();
    expect(parseItemLink("")).toBeNull();
  });

  it("devuelve null para texto que no es un link de ítem", () => {
    expect(parseItemLink("no es un link")).toBeNull();
    expect(parseItemLink("|Hquest:123|h[Una quest]|h")).toBeNull();
  });

  it("funciona sin bonus IDs (numBonusIds = 0)", () => {
    const link = "|cnIQ1:|Hitem:12345::::::::80::::0::::::|h[Ítem simple]|h|r";
    const parsed = parseItemLink(link);
    expect(parsed?.itemId).toBe(12345);
    expect(parsed?.bonusIds).toEqual([]);
  });

  it("qualityIndex es null si el link no trae el prefijo |cnIQ", () => {
    const link = "|cff1eff00|Hitem:12345::::::::80::::0::::::|h[Ítem viejo formato]|h|r";
    const parsed = parseItemLink(link);
    expect(parsed?.qualityIndex).toBeNull();
  });
});

describe("qualityNameFromIndex", () => {
  it("mapea los índices conocidos al nombre que espera qualityColor()", () => {
    expect(qualityNameFromIndex(4)).toBe("EPIC");
    expect(qualityNameFromIndex(3)).toBe("RARE");
    expect(qualityNameFromIndex(0)).toBe("POOR");
  });

  it("null para índice null o desconocido", () => {
    expect(qualityNameFromIndex(null)).toBeNull();
    expect(qualityNameFromIndex(99)).toBeNull();
  });
});

describe("wowheadParamsForItemLink", () => {
  it("arma item=ID&bonus=A:B cuando hay bonus IDs", () => {
    const parsed = parseItemLink(REAL_LINK)!;
    expect(wowheadParamsForItemLink(parsed)).toBe("item=268203&bonus=13334:12849");
  });

  it("arma solo item=ID sin bonus", () => {
    expect(wowheadParamsForItemLink({ itemId: 999, bonusIds: [], name: "x", qualityIndex: null })).toBe(
      "item=999"
    );
  });
});
