import { describe, it, expect } from "vitest";
import { summarizeVault, findVaultBonusCurrency, type CharacterVaultSlot, type CharacterCurrency } from "./sync-display";

function slot(overrides: Partial<CharacterVaultSlot> & { slot_type: string; slot_index: number }): CharacterVaultSlot {
  return {
    threshold: 2,
    progress: 2,
    level: 14,
    has_available_rewards: true,
    item_link: null,
    item_level: null,
    ...overrides,
  };
}

const REAL_ITEM_LINK =
  "|cnIQ4:|Hitem:268203::::::::90:105::95:2:13334:12849::::::|h[Hexing Spiritrender]|h|r";

describe("summarizeVault -- itemLink real por slot (GG)", () => {
  it("una casilla desbloqueada CON itemLink real lo expone en el VaultSlotView", () => {
    const groups = summarizeVault([
      slot({ slot_type: "3", slot_index: 1, item_link: REAL_ITEM_LINK, item_level: 318 }),
    ]);
    const raidGroup = groups.find((g) => g.key === "raid")!;

    expect(raidGroup.slots[0].itemLink).toBe(REAL_ITEM_LINK);
    expect(raidGroup.slots[0].itemLevel).toBe(318);
    expect(raidGroup.slots[0].unlocked).toBe(true);
  });

  it("una casilla desbloqueada sin itemLink todavía queda con itemLink null (el componente cae al placeholder atenuado)", () => {
    const groups = summarizeVault([slot({ slot_type: "3", slot_index: 1 })]);
    const raidGroup = groups.find((g) => g.key === "raid")!;

    expect(raidGroup.slots[0].unlocked).toBe(true);
    expect(raidGroup.slots[0].itemLink).toBeNull();
    expect(raidGroup.slots[0].tierLabel).not.toBeNull();
  });

  it("una casilla con progreso 0 esta semana SIGUE exponiendo su itemLink si Blizzard ya lo generó (premio sin reclamar de la semana pasada)", () => {
    const groups = summarizeVault([
      slot({
        slot_type: "3",
        slot_index: 1,
        progress: 0,
        item_link: REAL_ITEM_LINK,
        item_level: 318,
      }),
    ]);
    const raidGroup = groups.find((g) => g.key === "raid")!;

    expect(raidGroup.slots[0].unlocked).toBe(false);
    expect(raidGroup.slots[0].itemLink).toBe(REAL_ITEM_LINK);
    expect(raidGroup.slots[0].itemLevel).toBe(318);
  });

  it("lleva progress/threshold del slot, para el tooltip de una casilla bloqueada", () => {
    const groups = summarizeVault([slot({ slot_type: "1", slot_index: 1, progress: 5, threshold: 8 })]);
    const dungeonGroup = groups.find((g) => g.key === "dungeon")!;

    expect(dungeonGroup.slots[0].progress).toBe(5);
    expect(dungeonGroup.slots[0].threshold).toBe(8);
  });
});

describe("summarizeVault -- Voidcore (Concession): 2 preguntas distintas", () => {
  function concessionSlot(overrides: Partial<CharacterVaultSlot> = {}) {
    return slot({ slot_type: "5", slot_index: 2, threshold: 3, progress: 3, ...overrides });
  }

  it("Blizzard dice 'disponible' (progress>=threshold) pero SIN nada real en las otras 3 categorías -> ninguna de las 2 preguntas da disponible", () => {
    const groups = summarizeVault([
      concessionSlot(),
      slot({ slot_type: "3", slot_index: 1, progress: 0, threshold: 2, item_link: null }),
      slot({ slot_type: "1", slot_index: 1, progress: 0, threshold: 1, item_link: null }),
      slot({ slot_type: "6", slot_index: 1, progress: 0, threshold: 2, item_link: null }),
    ]);
    const concession = groups.find((g) => g.key === "concession")!;
    expect(concession.unlocked).toBe(0);
    expect(concession.concessionClaimableNow).toBe(false);
  });

  it("3 ítems VIEJOS sin reclamar y SIN progreso fresco -> SÍ se puede reclamar hoy, pero NO cuenta como progreso de esta semana", () => {
    const groups = summarizeVault([
      concessionSlot(),
      slot({ slot_type: "3", slot_index: 1, progress: 0, threshold: 2, item_link: REAL_ITEM_LINK }),
      slot({ slot_type: "3", slot_index: 2, progress: 0, threshold: 4, item_link: REAL_ITEM_LINK }),
      slot({ slot_type: "3", slot_index: 3, progress: 0, threshold: 6, item_link: REAL_ITEM_LINK }),
    ]);
    const concession = groups.find((g) => g.key === "concession")!;
    expect(concession.unlocked).toBe(0);
    expect(concession.concessionClaimableNow).toBe(true);
  });

  it("con 3+ categorías con progreso FRESCO de esta semana, las 2 preguntas dan disponible", () => {
    const groups = summarizeVault([
      concessionSlot(),
      slot({ slot_type: "3", slot_index: 1, progress: 2, threshold: 2, item_link: null }),
      slot({ slot_type: "1", slot_index: 1, progress: 1, threshold: 1, item_link: null }),
      slot({ slot_type: "6", slot_index: 1, progress: 2, threshold: 2, item_link: null }),
    ]);
    const concession = groups.find((g) => g.key === "concession")!;
    expect(concession.unlocked).toBe(1);
    expect(concession.concessionClaimableNow).toBe(true);
  });

  it("con exactamente 2 categorías con progreso fresco (una menos del umbral) ninguna de las 2 da disponible", () => {
    const groups = summarizeVault([
      concessionSlot(),
      slot({ slot_type: "3", slot_index: 1, progress: 2, threshold: 2, item_link: null }),
      slot({ slot_type: "1", slot_index: 1, progress: 1, threshold: 1, item_link: null }),
    ]);
    const concession = groups.find((g) => g.key === "concession")!;
    expect(concession.unlocked).toBe(0);
    expect(concession.concessionClaimableNow).toBe(false);
  });
});

describe("findVaultBonusCurrency", () => {
  function currency(overrides: Partial<CharacterCurrency> = {}): CharacterCurrency {
    return {
      currency_id: 3513,
      name: "Nebulous Voidcore",
      quantity: 4,
      currency_type: null,
      total_earned: null,
      max_quantity: null,
      use_total_earned_for_max_qty: null,
      max_weekly_quantity: null,
      quantity_earned_this_week: null,
      ...overrides,
    };
  }

  it("encuentra la moneda por su id, sin importar el nombre", () => {
    const found = findVaultBonusCurrency([currency({ currency_id: 3418 })]);
    expect(found?.currency_id).toBe(3418);
  });

  it("encuentra la moneda aunque el nombre llegue traducido", () => {
    const found = findVaultBonusCurrency([
      currency({ currency_id: 3513, name: "Núcleo del Vacío nebuloso" }),
    ]);
    expect(found?.currency_id).toBe(3513);
  });

  it("prefiere el id de la temporada vigente cuando llegan los dos", () => {
    const found = findVaultBonusCurrency([
      currency({ currency_id: 3418, name: "Núcleo del Vacío nebuloso" }),
      currency({ currency_id: 3513, name: "Núcleo del Vacío nebuloso" }),
    ]);
    expect(found?.currency_id).toBe(3513);
  });

  it("cae al nombre en inglés si el id no está en la lista", () => {
    const found = findVaultBonusCurrency([currency({ currency_id: 9999 })]);
    expect(found?.currency_id).toBe(9999);
  });

  it("null si el personaje no tiene esa moneda trackeada", () => {
    expect(findVaultBonusCurrency([currency({ currency_id: 9999, name: "Otra moneda" })])).toBeNull();
    expect(findVaultBonusCurrency(null)).toBeNull();
    expect(findVaultBonusCurrency([])).toBeNull();
  });
});
