import { describe, expect, it } from "vitest";
import { parseRecentRunsResponse, parseRunDetailsResponse } from "@/lib/mythic-plus-raiderio";

describe("parseRecentRunsResponse", () => {
  it("parsea las miticas recientes y saca el season slug del url", () => {
    const json = {
      mythic_plus_recent_runs: [
        {
          dungeon: "Windrunner Spire",
          mythic_level: 10,
          completed_at: "2026-07-15T13:09:43.000Z",
          clear_time_ms: 1266835,
          keystone_run_id: 40119605,
          num_keystone_upgrades: 2,
          url: "https://raider.io/mythic-plus-runs/season-mn-1/12345678-10-windrunner-spire",
        },
      ],
    };
    const runs = parseRecentRunsResponse(json);
    expect(runs).toEqual([
      {
        keystoneRunId: 40119605,
        dungeon: "Windrunner Spire",
        mythicLevel: 10,
        completedAt: "2026-07-15T13:09:43.000Z",
        clearTimeMs: 1266835,
        numKeystoneUpgrades: 2,
        seasonSlug: "season-mn-1",
      },
    ]);
  });

  it("da array vacio si mythic_plus_recent_runs no viene (personaje sin datos)", () => {
    expect(parseRecentRunsResponse({})).toEqual([]);
    expect(parseRecentRunsResponse(null)).toEqual([]);
  });

  it("descarta entradas sin los campos minimos en vez de tirar", () => {
    const json = { mythic_plus_recent_runs: [{ dungeon: "Sin nivel" }] };
    expect(parseRecentRunsResponse(json)).toEqual([]);
  });

  it("seasonSlug null si el url no matchea el patron esperado", () => {
    const json = {
      mythic_plus_recent_runs: [
        {
          dungeon: "D",
          mythic_level: 5,
          completed_at: "2026-01-01T00:00:00.000Z",
          clear_time_ms: 100,
          keystone_run_id: 1,
          url: "https://raider.io/characters/eu/kazzak/Foo",
        },
      ],
    };
    expect(parseRecentRunsResponse(json)[0].seasonSlug).toBeNull();
  });
});

describe("parseRunDetailsResponse", () => {
  const validJson = {
    dungeon: { name: "Windrunner Spire" },
    keystone_run_id: 40119605,
    mythic_level: 10,
    clear_time_ms: 1266835,
    completed_at: "2026-07-15T13:09:43.000Z",
    num_chests: 2,
    season: "season-mn-1",
    roster: [
      {
        role: "dps",
        items: { item_level_equipped: 293 },
        character: {
          name: "Emberjack",
          class: { name: "Mage" },
          realm: { slug: "kazzak" },
          region: { slug: "eu" },
        },
      },
      {
        role: "healer",
        items: { item_level_equipped: 267 },
        character: {
          name: "Sanadora",
          class: { name: "Paladin" },
          realm: { slug: "kazzak" },
          region: { slug: "eu" },
        },
      },
    ],
  };

  it("parsea el roster completo con ilvl por integrante", () => {
    const details = parseRunDetailsResponse(validJson);
    expect(details).not.toBeNull();
    expect(details?.dungeon).toBe("Windrunner Spire");
    expect(details?.numChests).toBe(2);
    expect(details?.roster).toHaveLength(2);
    expect(details?.roster[0]).toEqual({
      characterName: "Emberjack",
      realmSlug: "kazzak",
      regionSlug: "eu",
      className: "Mage",
      role: "dps",
      itemLevelEquipped: 293,
    });
  });

  it("da null si faltan campos minimos (reporte borrado/privado)", () => {
    expect(parseRunDetailsResponse({})).toBeNull();
    expect(parseRunDetailsResponse(null)).toBeNull();
  });

  it("descarta del roster una entrada sin nombre o reino, sin tirar el resto", () => {
    const json = {
      ...validJson,
      roster: [...validJson.roster, { role: "dps", items: {}, character: {} }],
    };
    expect(parseRunDetailsResponse(json)?.roster).toHaveLength(2);
  });
});
