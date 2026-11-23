import { describe, expect, it } from "vitest";
import {
  isSimStale,
  upgradeBadgeTier,
  metricLabel,
  normalizeBossName,
  roleMismatchesProvider,
  armorCategory,
  isRealUpgrade,
  WISHLIST_STALE_AFTER_DAYS,
} from "./wishlist";

describe("isSimStale", () => {
  it("no es vieja si se importó recién", () => {
    expect(isSimStale(new Date().toISOString())).toBe(false);
  });

  it("es vieja pasado el umbral de dias", () => {
    const old = new Date(Date.now() - (WISHLIST_STALE_AFTER_DAYS + 1) * 24 * 60 * 60 * 1000);
    expect(isSimStale(old.toISOString())).toBe(true);
  });

  it("justo antes del umbral no es vieja", () => {
    const recent = new Date(Date.now() - (WISHLIST_STALE_AFTER_DAYS - 1) * 24 * 60 * 60 * 1000);
    expect(isSimStale(recent.toISOString())).toBe(false);
  });
});

describe("upgradeBadgeTier", () => {
  it("verde arriba de 3%", () => {
    expect(upgradeBadgeTier(3.1)).toBe("high");
    expect(upgradeBadgeTier(10)).toBe("high");
  });

  it("amarillo entre 1% y 3% inclusive", () => {
    expect(upgradeBadgeTier(1)).toBe("mid");
    expect(upgradeBadgeTier(3)).toBe("mid");
    expect(upgradeBadgeTier(2)).toBe("mid");
  });

  it("gris debajo de 1%", () => {
    expect(upgradeBadgeTier(0.9)).toBe("low");
    expect(upgradeBadgeTier(0)).toBe("low");
  });
});

describe("metricLabel", () => {
  it("hps para qelive, dps para cualquier otro valor", () => {
    expect(metricLabel("hps")).toBe("HPS");
    expect(metricLabel("dps")).toBe("DPS");
    expect(metricLabel("otracosa")).toBe("DPS");
  });
});

describe("normalizeBossName", () => {
  it("colapsa comillas tipograficas y espacios", () => {
    expect(normalizeBossName("Belo’ren, Child of Al’ar")).toBe(normalizeBossName("Belo'ren, Child of Al'ar"));
    expect(normalizeBossName("  Rotmire  ")).toBe("rotmire");
  });

  it("es case-insensitive", () => {
    expect(normalizeBossName("IMPERATOR AVERZIAN")).toBe(normalizeBossName("Imperator Averzian"));
  });
});

describe("roleMismatchesProvider", () => {
  it("marca mismatch para tank/dps pegando qelive", () => {
    expect(roleMismatchesProvider("tank", "qelive")).toBe(true);
    expect(roleMismatchesProvider("dps", "qelive")).toBe(true);
  });

  it("marca mismatch para heal pegando raidbots", () => {
    expect(roleMismatchesProvider("heal", "raidbots")).toBe(true);
  });

  it("no hay mismatch en la combinacion esperada", () => {
    expect(roleMismatchesProvider("heal", "qelive")).toBe(false);
    expect(roleMismatchesProvider("dps", "raidbots")).toBe(false);
    expect(roleMismatchesProvider("tank", "raidbots")).toBe(false);
  });

  it("sin rol cargado, nunca marca mismatch", () => {
    expect(roleMismatchesProvider(null, "qelive")).toBe(false);
    expect(roleMismatchesProvider(null, "raidbots")).toBe(false);
  });
});

describe("armorCategory", () => {
  it("agrupa Placa/Malla/Cuero/Tela por item_subclass", () => {
    expect(armorCategory("Armor", "Plate", "Hands")).toBe("plate");
    expect(armorCategory("Armor", "Mail", "Waist")).toBe("mail");
    expect(armorCategory("Armor", "Leather", "Feet")).toBe("leather");
    expect(armorCategory("Armor", "Cloth", "Chest")).toBe("cloth");
  });

  it("los trinkets son subclase Miscellaneous pero se distinguen por el slot", () => {
    expect(armorCategory("Armor", "Miscellaneous", "Trinket")).toBe("trinket");
  });

  it("agrupa todas las armas juntas sin importar la subclase puntual", () => {
    expect(armorCategory("Weapon", "Polearm", "Two-Hand")).toBe("weapon");
    expect(armorCategory("Weapon", "Staff", "Two-Hand")).toBe("weapon");
  });

  it("cae a miscelaneos para anillos/collares/capas (subclase Miscellaneous sin ser trinket)", () => {
    expect(armorCategory("Armor", "Miscellaneous", "Finger")).toBe("misc");
    expect(armorCategory("Armor", "Miscellaneous", "Neck")).toBe("misc");
  });

  it("cae a miscelaneos si falta el dato de subclase", () => {
    expect(armorCategory("Armor", null, "Waist")).toBe("misc");
  });
});

describe("isRealUpgrade", () => {
  it("positivo es mejora, cero o negativo no", () => {
    expect(isRealUpgrade(0.1)).toBe(true);
    expect(isRealUpgrade(0)).toBe(false);
    expect(isRealUpgrade(-0.8)).toBe(false);
  });
});
