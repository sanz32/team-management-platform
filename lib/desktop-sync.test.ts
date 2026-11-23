import { describe, it, expect } from "vitest";
import {
  matchCharactersAgainstPool,
  matchGuildCharacters,
  filterFreshForeignCharacters,
  dedupeMatchedPreferOwn,
  updateCharacterScalarFields,
  upsertVaultAndCurrencies,
  CharacterRef,
  SyncCharacterPayload,
  MatchResult,
  MatchedCharacter,
} from "./desktop-sync";
import { createFakeSupabase } from "./test-utils/fake-supabase";

function ref(overrides: Partial<CharacterRef> & { id: string; name: string; realm_slug: string }): CharacterRef {
  return {
    realm_name: null,
    blizzard_character_id: null,
    gg_observed_at: null,
    ...overrides,
  };
}

function payload(overrides: Partial<SyncCharacterPayload> & { info: SyncCharacterPayload["info"] }): SyncCharacterPayload {
  return overrides;
}

describe("matchCharactersAgainstPool", () => {
  it("matchea por blizzard_character_id (guid) antes que por nombre", () => {
    const pool = [ref({ id: "c1", name: "Nërÿ", realm_slug: "stormrage", blizzard_character_id: 111 })];
    const incoming = [payload({ info: { name: "Otro Nombre", realm: "stormrage" }, guid: 111 })];

    const { matched, unmatched } = matchCharactersAgainstPool(pool, incoming);
    expect(matched).toHaveLength(1);
    expect(matched[0].characterId).toBe("c1");
    expect(unmatched).toHaveLength(0);
  });

  it("descarta el personaje FANTASMA en vez de pisar al que ya matcheó por guid", () => {
    const pool = [ref({ id: "c1", name: "Nèrý", realm_slug: "zuljin", blizzard_character_id: 200 })];
    const incoming = [
      payload({ info: { name: "Nèrý", realm: "zuljin" }, guid: 200 }),
      payload({ info: { name: "Nèrý", realm: "zuljin" }, guid: 999 }),
    ];

    const { matched, unmatched } = matchCharactersAgainstPool(pool, incoming);
    expect(matched).toHaveLength(1);
    expect(matched[0].character.guid).toBe(200);
    expect(unmatched).toHaveLength(1);
    expect(unmatched[0].guid).toBe(999);
  });

  it("cae al respaldo por nombre exacto cuando no hay guid", () => {
    const pool = [ref({ id: "c1", name: "Kaldor", realm_slug: "area-52", realm_name: "Area 52" })];
    const incoming = [payload({ info: { name: "Kaldor", realm: "Area 52" } })];

    const { matched } = matchCharactersAgainstPool(pool, incoming);
    expect(matched).toHaveLength(1);
    expect(matched[0].characterId).toBe("c1");
  });

  it("respaldo plegado (sin acentos) matchea solo si es único", () => {
    const pool = [ref({ id: "c1", name: "Nerÿ", realm_slug: "stormrage" })];
    const incoming = [payload({ info: { name: "Nërÿ", realm: "stormrage" } })];

    const { matched } = matchCharactersAgainstPool(pool, incoming);
    expect(matched).toHaveLength(1);
    expect(matched[0].characterId).toBe("c1");
  });

  it("respaldo plegado se descarta como unmatched si colisiona con varios (nunca acredita al azar)", () => {
    const pool = [
      ref({ id: "c1", name: "Nerÿ", realm_slug: "stormrage" }),
      ref({ id: "c2", name: "Nëry", realm_slug: "stormrage" }),
    ];
    const incoming = [payload({ info: { name: "Nérý", realm: "stormrage" } })];

    const { matched, unmatched } = matchCharactersAgainstPool(pool, incoming);
    expect(matched).toHaveLength(0);
    expect(unmatched).toHaveLength(1);
  });

  it("cada entrada matcheada lleva el gg_observed_at del personaje real", () => {
    const pool = [ref({ id: "c1", name: "Kaldor", realm_slug: "area-52", gg_observed_at: "2026-08-20T00:00:00Z" })];
    const incoming = [payload({ info: { name: "Kaldor", realm: "area-52" } })];

    const { matched } = matchCharactersAgainstPool(pool, incoming);
    expect(matched[0].ggObservedAt).toBe("2026-08-20T00:00:00Z");
  });
});

describe("matchGuildCharacters", () => {
  it("matchea contra TODO el guild, no solo un usuario -- es la relajación deliberada para gg-relay", () => {
    const supabase = createFakeSupabase({
      characters: [
        { id: "c1", user_id: "otro-usuario", name: "Rávia", realm_slug: "bleeding-hollow", realm_name: null, blizzard_character_id: null, gg_observed_at: null },
      ],
    });

    return matchGuildCharacters(supabase as unknown as Parameters<typeof matchGuildCharacters>[0], [
      payload({ info: { name: "Rávia", realm: "bleeding-hollow" }, source: "gg-relay", ts: 1000 }),
    ]).then(({ matched }) => {
      expect(matched).toHaveLength(1);
      expect(matched[0].characterId).toBe("c1");
    });
  });

  it("pagina más de 1000 filas (mismo criterio que fetchAllCharacterVault)", async () => {
    const rows = Array.from({ length: 1001 }, (_, i) => ({
      id: `c${i}`,
      user_id: "u",
      name: `Test${i}`,
      realm_slug: "testrealm",
      realm_name: null,
      blizzard_character_id: null,
      gg_observed_at: null,
    }));
    const supabase = createFakeSupabase({ characters: rows });

    const { matched } = await matchGuildCharacters(supabase as unknown as Parameters<typeof matchGuildCharacters>[0], [
      payload({ info: { name: "Test1000", realm: "testrealm" }, source: "gg-relay", ts: 1 }),
    ]);

    expect(matched).toHaveLength(1);
    expect(matched[0].characterId).toBe("c1000");
  });

  it("no consulta la base si no hay ningún personaje gg-relay para matchear", async () => {
    const supabase = createFakeSupabase({ characters: [] });
    const { matched, unmatched } = await matchGuildCharacters(
      supabase as unknown as Parameters<typeof matchGuildCharacters>[0],
      []
    );
    expect(matched).toHaveLength(0);
    expect(unmatched).toHaveLength(0);
  });
});

describe("filterFreshForeignCharacters", () => {
  function matched(ts: number | undefined, ggObservedAt: string | null): MatchResult["matched"][number] {
    return { character: payload({ info: { name: "x", realm: "y" }, ts }), characterId: "c1", ggObservedAt };
  }

  it("descarta un relay sin ts -- no hay forma segura de compararlo", () => {
    const result = filterFreshForeignCharacters([matched(undefined, null)]);
    expect(result).toHaveLength(0);
  });

  it("acepta cualquier ts si todavía no había ningún dato guardado (gg_observed_at null)", () => {
    const result = filterFreshForeignCharacters([matched(1000, null)]);
    expect(result).toHaveLength(1);
  });

  it("acepta un relay más NUEVO que lo ya guardado", () => {
    const stored = new Date("2026-08-20T00:00:00Z").toISOString();
    const newerTs = Math.floor(new Date("2026-08-20T01:00:00Z").getTime() / 1000);
    const result = filterFreshForeignCharacters([matched(newerTs, stored)]);
    expect(result).toHaveLength(1);
  });

  it("rechaza un relay más VIEJO que lo ya guardado -- nunca pisa un dato más fresco", () => {
    const stored = new Date("2026-08-20T01:00:00Z").toISOString();
    const olderTs = Math.floor(new Date("2026-08-20T00:00:00Z").getTime() / 1000);
    const result = filterFreshForeignCharacters([matched(olderTs, stored)]);
    expect(result).toHaveLength(0);
  });

  it("acepta un relay con el MISMO ts -- puede traer más datos que la vez anterior", () => {
    const storedDate = new Date("2026-08-20T00:00:00Z");
    const sameTs = Math.floor(storedDate.getTime() / 1000);
    const result = filterFreshForeignCharacters([matched(sameTs, storedDate.toISOString())]);
    expect(result).toHaveLength(1);
  });
});

describe("upsertVaultAndCurrencies -- poda de casillas huérfanas", () => {
  function baseSlot(overrides: Partial<{ type: string; index: number }> = {}) {
    return { threshold: 2, progress: 2, level: 14, type: "3", index: 1, ...overrides };
  }

  it("borra una fila que ya no aparece en el sync (bug real: oranwütanga con una fila type=5 congelada en true)", async () => {
    const supabase = createFakeSupabase({
      character_vault: [
        { id: "v1", character_id: "c1", slot_type: "3", slot_index: 1, has_available_rewards: false },
        { id: "v-orphan", character_id: "c1", slot_type: "5", slot_index: 1, has_available_rewards: true },
      ],
    });

    const matched: MatchedCharacter[] = [
      {
        characterId: "c1",
        character: {
          info: { name: "x", realm: "y" },
          vault: { hasAvailableRewards: false, slots: [baseSlot()] },
        },
      },
    ];

    await upsertVaultAndCurrencies(supabase as unknown as Parameters<typeof upsertVaultAndCurrencies>[0], matched);

    const rows = supabase._tables.character_vault;
    expect(rows.find((r) => r.id === "v-orphan")).toBeUndefined();
    expect(rows.find((r) => r.slot_type === "3" && r.slot_index === 1)?.has_available_rewards).toBe(false);
  });

  it("NO borra nada si el payload de ese personaje no trae vault esta pasada (ej. un gg-relay de solo monedas)", async () => {
    const supabase = createFakeSupabase({
      character_vault: [{ id: "v1", character_id: "c1", slot_type: "3", slot_index: 1, has_available_rewards: true }],
    });

    const matched: MatchedCharacter[] = [
      { characterId: "c1", character: { info: { name: "x", realm: "y" } } },
    ];

    await upsertVaultAndCurrencies(supabase as unknown as Parameters<typeof upsertVaultAndCurrencies>[0], matched);

    expect(supabase._tables.character_vault.find((r) => r.id === "v1")).toBeDefined();
  });
});

describe("upsertVaultAndCurrencies -- limpieza de item_link viejo", () => {
  it("limpia un item_link viejo cuando GG manda `itemLink: null` explícito para esa casilla", async () => {
    const supabase = createFakeSupabase({
      character_vault: [
        {
          id: "v1",
          character_id: "c1",
          slot_type: "1",
          slot_index: 1,
          item_link: "|cnIQ4:|Hitem:1::::::::::::::|h[Ítem viejo]|h|r",
          item_level: 318,
        },
      ],
    });

    const matched: MatchedCharacter[] = [
      {
        characterId: "c1",
        character: {
          info: { name: "x", realm: "y" },
          vault: {
            hasAvailableRewards: true,
            slots: [{ type: "1", index: 1, threshold: 1, progress: 0, level: 0, itemLink: null }],
          },
        },
      },
    ];

    await upsertVaultAndCurrencies(supabase as unknown as Parameters<typeof upsertVaultAndCurrencies>[0], matched);

    const row = supabase._tables.character_vault.find((r) => r.id === "v1");
    expect(row?.item_link).toBeNull();
    expect(row?.item_level).toBeNull();
  });

  it("NO toca un item_link ya guardado cuando la fuente de esta pasada no manda la clave (AlterEgo, undefined)", async () => {
    const supabase = createFakeSupabase({
      character_vault: [
        {
          id: "v1",
          character_id: "c1",
          slot_type: "1",
          slot_index: 1,
          item_link: "|cnIQ4:|Hitem:1::::::::::::::|h[Ítem real de GG]|h|r",
          item_level: 305,
        },
      ],
    });

    const matched: MatchedCharacter[] = [
      {
        characterId: "c1",
        character: {
          info: { name: "x", realm: "y" },
          vault: { hasAvailableRewards: true, slots: [{ type: "1", index: 1, threshold: 1, progress: 0, level: 0 }] },
        },
      },
    ];

    await upsertVaultAndCurrencies(supabase as unknown as Parameters<typeof upsertVaultAndCurrencies>[0], matched);

    const row = supabase._tables.character_vault.find((r) => r.id === "v1");
    expect(row?.item_link).toBe("|cnIQ4:|Hitem:1::::::::::::::|h[Ítem real de GG]|h|r");
    expect(row?.item_level).toBe(305);
  });

  it("sigue guardando un item_link real cuando GG lo manda", async () => {
    const supabase = createFakeSupabase({ character_vault: [] });

    const matched: MatchedCharacter[] = [
      {
        characterId: "c1",
        character: {
          info: { name: "x", realm: "y" },
          vault: {
            hasAvailableRewards: true,
            slots: [
              {
                type: "1",
                index: 1,
                threshold: 1,
                progress: 1,
                level: 0,
                itemLink: "|cnIQ4:|Hitem:2::::::::::::::|h[Ítem nuevo]|h|r",
                itemLevel: 320,
              },
            ],
          },
        },
      },
    ];

    await upsertVaultAndCurrencies(supabase as unknown as Parameters<typeof upsertVaultAndCurrencies>[0], matched);

    const row = supabase._tables.character_vault.find(
      (r) => r.character_id === "c1" && r.slot_type === "1" && r.slot_index === 1
    );
    expect(row?.item_link).toBe("|cnIQ4:|Hitem:2::::::::::::::|h[Ítem nuevo]|h|r");
    expect(row?.item_level).toBe(320);
  });
});

describe("dedupeMatchedPreferOwn", () => {
  function own(characterId: string, itemLink: string | null): MatchedCharacter {
    return {
      characterId,
      character: {
        info: { name: "x", realm: "y" },
        vault: { hasAvailableRewards: true, slots: [{ type: "1", index: 1, threshold: 1, progress: 0, level: 0, itemLink }] },
      },
    };
  }
  function relay(characterId: string, itemLink: string | null): MatchedCharacter {
    return {
      characterId,
      character: {
        info: { name: "x", realm: "y" },
        source: "gg-relay",
        vault: { hasAvailableRewards: true, slots: [{ type: "1", index: 1, threshold: 1, progress: 0, level: 0, itemLink }] },
      },
    };
  }

  it("own siempre gana sobre gg-relay para el mismo characterId, sin importar el orden", () => {
    const ownEntry = own("c1", null);
    const relayEntry = relay("c1", "|cnIQ4:|Hitem:1::::::::::::::|h[Viejo]|h|r");

    expect(dedupeMatchedPreferOwn([ownEntry, relayEntry])).toEqual([ownEntry]);
    expect(dedupeMatchedPreferOwn([relayEntry, ownEntry])).toEqual([ownEntry]);
  });

  it("no toca personajes distintos ni colapsa entradas sin conflicto", () => {
    const c1 = own("c1", null);
    const c2 = relay("c2", "|cnIQ4:|Hitem:1::::::::::::::|h[Ajeno]|h|r");

    expect(dedupeMatchedPreferOwn([c1, c2])).toEqual([c1, c2]);
  });

  it("de punta a punta: sin dedup un gg-relay viejo pisaba el item_link recién limpiado por la sync propia; con dedup no", async () => {
    const supabase = createFakeSupabase({
      character_vault: [
        {
          id: "v1",
          character_id: "c1",
          slot_type: "1",
          slot_index: 1,
          item_link: "|cnIQ4:|Hitem:1::::::::::::::|h[Ítem viejo]|h|r",
          item_level: 318,
        },
      ],
    });

    const ownEntry = own("c1", null);
    const relayEntry = relay("c1", "|cnIQ4:|Hitem:1::::::::::::::|h[Ítem viejo]|h|r");

    const deduped = dedupeMatchedPreferOwn([ownEntry, relayEntry]);
    await upsertVaultAndCurrencies(supabase as unknown as Parameters<typeof upsertVaultAndCurrencies>[0], deduped);

    const row = supabase._tables.character_vault.find((r) => r.id === "v1");
    expect(row?.item_link).toBeNull();
  });

  it("reproduce el bug SIN el dedup, para dejar constancia de la causa real", async () => {
    const supabase = createFakeSupabase({
      character_vault: [
        { id: "v1", character_id: "c1", slot_type: "1", slot_index: 1, item_link: null, item_level: null },
      ],
    });

    const ownEntry = own("c1", null);
    const relayEntry = relay("c1", "|cnIQ4:|Hitem:1::::::::::::::|h[Ítem viejo]|h|r");

    await upsertVaultAndCurrencies(supabase as unknown as Parameters<typeof upsertVaultAndCurrencies>[0], [
      ownEntry,
      relayEntry,
    ]);

    const row = supabase._tables.character_vault.find((r) => r.id === "v1");
    expect(row?.item_link).toBe("|cnIQ4:|Hitem:1::::::::::::::|h[Ítem viejo]|h|r");
  });
});

describe("updateCharacterScalarFields", () => {
  function seedCharacter(overrides: Record<string, unknown> = {}) {
    return createFakeSupabase({
      characters: [{ id: "c1", gg_observed_at: null, mythic_plus_dungeons: null, ...overrides }],
    });
  }
  function asClient(supabase: ReturnType<typeof seedCharacter>) {
    return supabase as unknown as Parameters<typeof updateCharacterScalarFields>[0];
  }

  it("no escribe mythic_plus_dungeons con un array VACÍO -- evita borrar un dato bueno con 'todavía no se sabe'", async () => {
    const existing = [{ challengeModeID: 588, level: 10, score: 165, finishedSuccess: true }];
    const supabase = seedCharacter({ mythic_plus_dungeons: existing });

    await updateCharacterScalarFields(asClient(supabase), "c1", {
      info: { name: "x", realm: "y" },
      source: "own",
      mythicplus: { dungeons: [] },
    });

    expect(supabase._tables.characters[0].mythic_plus_dungeons).toEqual(existing);
  });

  it("SÍ escribe mythic_plus_dungeons cuando el array trae datos reales", async () => {
    const supabase = seedCharacter();
    const dungeons = [{ challengeModeID: 588, level: 10, score: 165, finishedSuccess: true }];

    await updateCharacterScalarFields(asClient(supabase), "c1", {
      info: { name: "x", realm: "y" },
      source: "own",
      mythicplus: { dungeons },
    });

    expect(supabase._tables.characters[0].mythic_plus_dungeons).toEqual(dungeons);
  });

  it("sin ts (AlterEgo) NO toca gg_observed_at -- no bloquea un futuro relay de GG", async () => {
    const supabase = seedCharacter({ gg_observed_at: "2026-08-20T00:00:00.000Z" });

    await updateCharacterScalarFields(asClient(supabase), "c1", {
      info: { name: "x", realm: "y" },
      source: "own",
      money: 12345,
    });

    expect(supabase._tables.characters[0].gg_observed_at).toBe("2026-08-20T00:00:00.000Z");
    expect(supabase._tables.characters[0].gold).toBe(1.2345);
  });

  it("con ts (GG) SÍ actualiza gg_observed_at", async () => {
    const supabase = seedCharacter();
    const ts = Math.floor(new Date("2026-08-25T12:00:00Z").getTime() / 1000);

    await updateCharacterScalarFields(asClient(supabase), "c1", {
      info: { name: "x", realm: "y" },
      source: "own",
      ts,
    });

    expect(supabase._tables.characters[0].gg_observed_at).toBe(new Date(ts * 1000).toISOString());
  });

  it("no escribe desktop_synced_at para un 'gg-relay' -- ese personaje puede no tener la app instalada nunca", async () => {
    const supabase = seedCharacter({ desktop_synced_at: null });

    await updateCharacterScalarFields(asClient(supabase), "c1", {
      info: { name: "x", realm: "y" },
      source: "gg-relay",
      ts: 1000,
      money: 500,
    });

    expect(supabase._tables.characters[0].desktop_synced_at).toBeNull();
    expect(supabase._tables.characters[0].gold).toBe(0.05);
  });
});
