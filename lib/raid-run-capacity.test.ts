import { describe, expect, it } from "vitest";
import { computeRaidRunCapacity } from "@/lib/raid-run-capacity";
import type { AutoGenerateInput, Candidate, RoleRequest } from "@/lib/roster-generator";

type CharSpec = {
  name: string;
  class: string;
  role: string;
  ilvl?: number;
  isOffSpec?: boolean;
  isMainClass?: boolean;
  isDayOff?: boolean;
};

function char(userId: string, username: string, spec: CharSpec): Candidate & { isSaved: boolean | null } {
  return {
    id: `${userId}-${spec.name}`,
    user_id: userId,
    name: spec.name,
    realm_slug: "area-52",
    region: "us",
    ilvl: spec.ilvl ?? 290,
    class: spec.class,
    active_spec: spec.class,
    role: spec.role,
    discord_username: username,
    isOffSpec: spec.isOffSpec ?? false,
    specUsed: spec.class,
    hasMochila: false,
    mochilaCount: 0,
    isMainClass: spec.isMainClass ?? true,
    ownerMainClasses: [spec.class],
    tier: "normal",
    isDayOff: spec.isDayOff ?? false,
    isSaved: null,
  };
}

function buildSuggestions(
  users: { userId: string; username: string; chars: CharSpec[] }[]
): AutoGenerateInput["suggestions"] {
  const suggestions: AutoGenerateInput["suggestions"] = {};
  for (const u of users) {
    for (const c of u.chars) {
      if (!suggestions[c.role]) suggestions[c.role] = [];
      let entry = suggestions[c.role].find((x) => x.user_id === u.userId);
      if (!entry) {
        entry = { user_id: u.userId, discord_username: u.username, characters: [] };
        suggestions[c.role].push(entry);
      }
      entry.characters.push(char(u.userId, u.username, c));
    }
  }
  return suggestions;
}

const roles = (tank: number, heal: number, dps: number): RoleRequest[] =>
  [
    { role: "tank" as const, count: tank, minIlvl: 285 },
    { role: "heal" as const, count: heal, minIlvl: 285 },
    { role: "dps" as const, count: dps, minIlvl: 285 },
  ].filter((r) => r.count > 0);

function group(prefix: string, count: number, cls: string, role: string) {
  return Array.from({ length: count }, (_, i) => ({
    userId: `${prefix}${i}`,
    username: `${prefix}${i}`,
    chars: [{ name: `${prefix}${i}c`, class: cls, role }],
  }));
}

const SMALL_ROSTER = roles(1, 1, 2);

const oneRunOfPeople = (suffix: string) => [
  ...group(`t${suffix}`, 1, "Warrior", "tank"),
  ...group(`h${suffix}`, 1, "Priest", "heal"),
  ...group(`d${suffix}`, 2, "Mage", "dps"),
];

describe("computeRaidRunCapacity", () => {
  it("cuenta 1 run cuando el pool alcanza justo para una y se agota", () => {
    const suggestions = buildSuggestions(oneRunOfPeople("a"));
    const result = computeRaidRunCapacity({ roles: SMALL_ROSTER }, suggestions);
    expect(result.runs).toBe(1);
    expect(result.limitingReason).not.toBeNull();
  });

  it("cuenta 2 runs cuando el pool tiene el doble de gente", () => {
    const suggestions = buildSuggestions([...oneRunOfPeople("a"), ...oneRunOfPeople("b")]);
    expect(computeRaidRunCapacity({ roles: SMALL_ROSTER }, suggestions).runs).toBe(2);
  });

  it("un miembro con varios personajes unsaved cubre varias runs, una por vez", () => {
    const suggestions = buildSuggestions([
      {
        userId: "multiTank",
        username: "multiTank",
        chars: [
          { name: "tank1", class: "Warrior", role: "tank" },
          { name: "tank2", class: "Paladin", role: "tank" },
          { name: "tank3", class: "Druid", role: "tank" },
        ],
      },
      {
        userId: "multiHeal",
        username: "multiHeal",
        chars: [
          { name: "heal1", class: "Priest", role: "heal" },
          { name: "heal2", class: "Shaman", role: "heal" },
          { name: "heal3", class: "Monk", role: "heal" },
        ],
      },
      ...group("d", 6, "Mage", "dps"),
    ]);

    const result = computeRaidRunCapacity({ roles: SMALL_ROSTER }, suggestions);

    expect(result.runs).toBe(3);
  });

  it("no muta el pool que recibe (se puede reusar para otra raid)", () => {
    const suggestions = buildSuggestions([...oneRunOfPeople("a"), ...oneRunOfPeople("b")]);
    const dpsBefore = suggestions.dps.length;
    computeRaidRunCapacity({ roles: SMALL_ROSTER }, suggestions);
    expect(suggestions.dps.length).toBe(dpsBefore);
    expect(computeRaidRunCapacity({ roles: SMALL_ROSTER }, suggestions).runs).toBe(2);
  });

  it("devuelve 0 runs y nombra el rol que falta", () => {
    const suggestions = buildSuggestions([
      ...group("t", 1, "Warrior", "tank"),
      ...group("d", 2, "Mage", "dps"),
    ]);
    const result = computeRaidRunCapacity({ roles: SMALL_ROSTER }, suggestions);
    expect(result.runs).toBe(0);
    expect(result.limitingReason).toContain("Heal");
  });

  it("devuelve 0 runs con el pool completamente vacío", () => {
    const result = computeRaidRunCapacity({ roles: SMALL_ROSTER }, {});
    expect(result.runs).toBe(0);
    expect(result.limitingReason).toBe("No hay candidatos disponibles para los roles pedidos");
  });

  it("no cuenta una run que incumple un mínimo de clase pedido", () => {
    const suggestions = buildSuggestions([
      ...group("t", 1, "Warrior", "tank"),
      ...group("h", 1, "Priest", "heal"),
      { userId: "dk", username: "dk", chars: [{ name: "dk1", class: "Death Knight", role: "dps" }] },
      ...group("d", 1, "Mage", "dps"),
    ]);
    const result = computeRaidRunCapacity(
      { roles: SMALL_ROSTER, classRequirements: [{ class: "Death Knight", min: 2, max: null }] },
      suggestions
    );
    expect(result.runs).toBe(0);
    expect(result.limitingReason).toContain("Death Knight");
  });

  it("cuenta la run que solo se completa reasignando roles entre cupos", () => {
    const suggestions = buildSuggestions([
      {
        userId: "t1",
        username: "t1",
        chars: [
          { name: "t1tank", class: "Warrior", role: "tank" },
          { name: "t1dps", class: "Warrior", role: "dps" },
        ],
      },
      {
        userId: "t2",
        username: "t2",
        chars: [
          { name: "t2tank", class: "Paladin", role: "tank" },
          { name: "t2dps", class: "Paladin", role: "dps" },
        ],
      },
      ...Array.from({ length: 4 }, (_, i) => ({
        userId: `ot${i}`,
        username: `ot${i}`,
        chars: [{ name: `ottk${i}`, class: "Demon Hunter", role: "tank", isDayOff: true }],
      })),
      ...group("d", 1, "Mage", "dps"),
      {
        userId: "s1",
        username: "s1",
        chars: [{ name: "spare1", class: "Druid", role: "dps", isOffSpec: true, isMainClass: false }],
      },
      {
        userId: "s2",
        username: "s2",
        chars: [{ name: "spare2", class: "Monk", role: "dps", isOffSpec: true, isMainClass: false }],
      },
      ...group("h", 1, "Priest", "heal"),
    ]);

    const result = computeRaidRunCapacity({ roles: roles(2, 1, 3) }, suggestions);
    expect(result.runs).toBe(1);
  });

  describe("clase obligatoria del contenido", () => {
    const monkHeal = [{ role: "heal", class: "Monk", count: 1 }];

    it("no cuenta la run si el pool no puede cubrirla", () => {
      const suggestions = buildSuggestions(oneRunOfPeople("a"));
      const result = computeRaidRunCapacity(
        { roles: SMALL_ROSTER, requiredRoleClasses: monkHeal },
        suggestions
      );
      expect(result.runs).toBe(0);
      expect(result.limitingReason).toContain("Monk");
    });

    it("cuenta la run cuando el pool sí la cubre", () => {
      const suggestions = buildSuggestions([
        ...group("t", 1, "Warrior", "tank"),
        { userId: "mk", username: "mk", chars: [{ name: "monk1", class: "Monk", role: "heal" }] },
        ...group("d", 2, "Mage", "dps"),
      ]);
      const result = computeRaidRunCapacity(
        { roles: SMALL_ROSTER, requiredRoleClasses: monkHeal },
        suggestions
      );
      expect(result.runs).toBeGreaterThanOrEqual(1);
    });
  });

  it("es determinista: dos llamadas seguidas dan el mismo conteo", () => {
    const suggestions = buildSuggestions([
      ...group("t", 3, "Warrior", "tank"),
      ...group("h", 4, "Priest", "heal"),
      ...group("d", 9, "Mage", "dps"),
    ]);
    const a = computeRaidRunCapacity({ roles: SMALL_ROSTER }, suggestions);
    const b = computeRaidRunCapacity({ roles: SMALL_ROSTER }, suggestions);
    expect(a.runs).toBe(b.runs);
    expect(a.limitingReason).toBe(b.limitingReason);
  });
});
