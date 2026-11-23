import { describe, it, expect } from "vitest";
import { raidsForOffer, type RaidMatcher } from "./boost-raid-match";

const VA: RaidMatcher = { id: "va", name: "The Venomous Abyss", abbr: "VA" };
const TG: RaidMatcher = { id: "tg", name: "The Tidebound Grotto", abbr: "TG" };
const RAIDS = [VA, TG];

function ids(offer: { titleEn: string; descriptionEn?: string | null }) {
  return raidsForOffer(RAIDS, offer).map((r) => r.id);
}

describe("raidsForOffer", () => {
  it("reconoce la raid por su nombre completo", () => {
    expect(ids({ titleEn: "Venomous Abyss 8/8 ATP 15 HEROIC" })).toEqual(["va"]);
    expect(ids({ titleEn: "Tidebound Grotto SAVED HEROIC" })).toEqual(["tg"]);
  });

  it("reconoce las DOS cuando el paquete vende las dos", () => {
    expect(ids({ titleEn: "Venomous Abyss + Tidebound Grotto 9/9 SAVED NM" })).toEqual([
      "va",
      "tg",
    ]);
  });

  it("reconoce el nombre abreviado a una palabra, como lo escribe el catálogo", () => {
    expect(ids({ titleEn: "Venomous + Tidebound 9/9 FP 15 (VIP) HEROIC" })).toEqual(["va", "tg"]);
    expect(ids({ titleEn: "Venomous + Tidebound FP 9/9 20 (VIP) HEROIC" })).toEqual(["va", "tg"]);
  });

  it("reconoce las iniciales, que solo aparecen en la descripción", () => {
    expect(ids({ titleEn: "Full clear bundle", descriptionEn: "TG+VA 9/9 Saved" })).toEqual([
      "va",
      "tg",
    ]);
  });

  it("devuelve las raids en el orden de la temporada, no en el del título", () => {
    expect(ids({ titleEn: "Tidebound Grotto + Venomous Abyss bundle" })).toEqual(["va", "tg"]);
  });

  it("un paquete de Mítico de una sola raid no arrastra la otra", () => {
    expect(ids({ titleEn: "Tidebound Grotto FP25 MYTH" })).toEqual(["tg"]);
    expect(ids({ titleEn: "Venomous Abyss 4/8 FP MYTH" })).toEqual(["va"]);
  });

  it("la abreviatura tiene que ser una PALABRA, no un trozo de otra", () => {
    expect(ids({ titleEn: "Vault vanguard advantage package" })).toEqual([]);
    expect(ids({ titleEn: "Heritage bundle" })).toEqual([]);
  });

  it("no depende de mayúsculas ni de espacios de más", () => {
    expect(ids({ titleEn: "  VENOMOUS   ABYSS   8/8  " })).toEqual(["va"]);
    expect(ids({ titleEn: "tidebound grotto unsaved" })).toEqual(["tg"]);
  });

  it("un paquete que no nombra ninguna raid devuelve vacío", () => {
    expect(ids({ titleEn: "Mythic+ dungeon bundle", descriptionEn: "10 dungeons" })).toEqual([]);
  });

  it("sin raids configuradas no devuelve nada, y no rompe", () => {
    expect(raidsForOffer([], { titleEn: "Venomous Abyss 8/8" })).toEqual([]);
  });

  it("tolera una raid sin abreviatura", () => {
    const sinAbbr: RaidMatcher = { id: "x", name: "The Emerald Vault", abbr: null };
    expect(raidsForOffer([sinAbbr], { titleEn: "Emerald Vault 5/5 HEROIC" }).map((r) => r.id)).toEqual(
      ["x"]
    );
  });
});
