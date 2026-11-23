import { describe, expect, it } from "vitest";
import {
  generateAutomaticSelection,
  type AutoGenerateInput,
  type Candidate,
  type CharacterTier,
  type RoleRequest,
} from "@/lib/roster-generator";

const RUNS = 15;
const seeds = (n: number) => Array.from({ length: n }, (_, i) => i * 7919 + 13);

type CharSpec = {
  name: string;
  class: string;
  role: string;
  ilvl?: number;
  isOffSpec?: boolean;
  isMainClass?: boolean;
  isDayOff?: boolean;
  isSaved?: boolean | null;
  tier?: CharacterTier;
  spec?: string;
  hasMochila?: boolean;
  mochilaCount?: number;
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
    active_spec: spec.spec ?? spec.class,
    role: spec.role,
    discord_username: username,
    isOffSpec: spec.isOffSpec ?? false,
    specUsed: spec.spec ?? spec.class,
    hasMochila: spec.hasMochila ?? false,
    mochilaCount: spec.mochilaCount ?? 0,
    isMainClass: spec.isMainClass ?? true,
    ownerMainClasses: [],
    tier: spec.tier ?? "normal",
    isDayOff: spec.isDayOff ?? false,
    isSaved: spec.isSaved ?? null,
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

  for (const u of users) {
    const mains = [...new Set(u.chars.filter((c) => c.isMainClass ?? true).map((c) => c.class))];
    for (const entries of Object.values(suggestions)) {
      for (const entry of entries) {
        if (entry.user_id !== u.userId) continue;
        for (const c of entry.characters) c.ownerMainClasses = mains;
      }
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

const atLeast = (cls: string, n: number) => ({ class: cls, min: n, max: null });
const exactly = (cls: string, n: number) => ({ class: cls, min: n, max: n });
const atMost = (cls: string, n: number) => ({ class: cls, min: 0, max: n });

describe("generateAutomaticSelection", () => {
  it("nunca pone al mismo usuario en dos cupos", () => {
    const suggestions = buildSuggestions([
      { userId: "u1", username: "Uno", chars: [{ name: "a", class: "Paladin", role: "tank" }, { name: "b", class: "Paladin", role: "dps" }] },
      { userId: "u2", username: "Dos", chars: [{ name: "c", class: "Warrior", role: "tank" }, { name: "d", class: "Warrior", role: "dps" }] },
      { userId: "u3", username: "Tres", chars: [{ name: "e", class: "Mage", role: "dps" }] },
    ]);
    for (const seed of seeds(RUNS)) {
      const { picks } = generateAutomaticSelection({ roles: roles(1, 0, 2), suggestions, seed });
      const userIds = picks.map((p) => p.candidate.user_id);
      expect(new Set(userIds).size).toBe(userIds.length);
    }
  });

  it("no saca a nadie de su clase main solo para no pasarse de una clase pedida", () => {
    const suggestions = buildSuggestions([
      { userId: "u1", username: "Uno", chars: [{ name: "m1", class: "Mage", role: "dps" }] },
      { userId: "u2", username: "Dos", chars: [{ name: "m2", class: "Mage", role: "dps" }] },
      {
        userId: "u3",
        username: "Tres",
        chars: [
          { name: "m3", class: "Mage", role: "dps", isMainClass: true },
          { name: "h3", class: "Hunter", role: "dps", isMainClass: false },
        ],
      },
    ]);
    for (const seed of seeds(RUNS)) {
      const { picks } = generateAutomaticSelection({
        roles: roles(0, 0, 3),
        suggestions,
        classRequirements: [atLeast("Mage", 2)],
        seed,
      });
      const u3 = picks.find((p) => p.candidate.user_id === "u3");
      expect(u3?.candidate.class).toBe("Mage");
    }
  });

  it("respeta un máximo explícito de clase", () => {
    const suggestions = buildSuggestions([
      { userId: "u1", username: "Uno", chars: [{ name: "p1", class: "Paladin", role: "dps" }] },
      { userId: "u2", username: "Dos", chars: [{ name: "p2", class: "Paladin", role: "dps" }] },
      { userId: "u3", username: "Tres", chars: [{ name: "h", class: "Hunter", role: "dps" }] },
    ]);
    for (const seed of seeds(RUNS)) {
      const { picks } = generateAutomaticSelection({
        roles: roles(0, 0, 2),
        suggestions,
        classRequirements: [atMost("Paladin", 1)],
        seed,
      });
      expect(picks.filter((p) => p.candidate.class === "Paladin")).toHaveLength(1);
    }
  });

  it("cumple una clase pedida aunque el dueño tenga muchos más alts de otra clase", () => {
    const paladins = Array.from({ length: 12 }, (_, i) => ({
      name: `pala${i}`,
      class: "Paladin",
      role: "dps",
      isMainClass: true,
    }));
    const dks = Array.from({ length: 5 }, (_, i) => ({
      name: `dk${i}`,
      class: "Death Knight",
      role: "dps",
      isMainClass: false,
    }));
    const suggestions = buildSuggestions([
      { userId: "u1", username: "Ivo", chars: [...paladins, ...dks] },
      { userId: "u2", username: "Otro", chars: [{ name: "x", class: "Hunter", role: "dps" }] },
    ]);

    for (const seed of seeds(RUNS)) {
      const { picks } = generateAutomaticSelection({
        roles: roles(0, 0, 2),
        suggestions,
        classRequirements: [atLeast("Death Knight", 1)],
        seed,
      });
      expect(picks.filter((p) => p.candidate.class === "Death Knight")).toHaveLength(1);
    }
  });

  it("respeta la clase main del dueño cuando ninguna clase pedida lo contradice", () => {
    const suggestions = buildSuggestions([
      {
        userId: "u1",
        username: "aure",
        chars: [
          { name: "dh1", class: "Demon Hunter", role: "tank", isMainClass: true },
          { name: "dk1", class: "Death Knight", role: "tank", isMainClass: false },
          { name: "war1", class: "Warrior", role: "tank", isMainClass: false, ilvl: 293 },
        ],
      },
    ]);
    for (const seed of seeds(RUNS)) {
      const { picks } = generateAutomaticSelection({ roles: roles(1, 0, 0), suggestions, seed });
      expect(picks[0].candidate.class).toBe("Demon Hunter");
    }
  });

  it("un miembro con dos mains no sale de una tercera clase", () => {
    const twoMains = (name: string, cls: string, ilvl: number) => ({
      name,
      class: cls,
      role: "dps",
      ilvl,
      isMainClass: cls === "Paladin" || cls === "Death Knight",
    });
    const suggestions = buildSuggestions([
      {
        userId: "u1",
        username: "Dual",
        chars: [
          twoMains("pala", "Paladin", 290),
          twoMains("dk", "Death Knight", 290),
          twoMains("mage", "Mage", 300),
        ],
      },
    ]);
    for (const seed of seeds(RUNS)) {
      const { picks } = generateAutomaticSelection({ roles: roles(0, 0, 1), suggestions, seed });
      expect(["Paladin", "Death Knight"]).toContain(picks[0].candidate.class);
    }
  });

  it("una clase pedida gana sobre la clase main del dueño", () => {
    const suggestions = buildSuggestions([
      {
        userId: "u1",
        username: "aure",
        chars: [
          { name: "dh1", class: "Demon Hunter", role: "tank", isMainClass: true },
          { name: "war1", class: "Warrior", role: "tank", isMainClass: false },
        ],
      },
    ]);
    for (const seed of seeds(RUNS)) {
      const { picks } = generateAutomaticSelection({
        roles: roles(1, 0, 0),
        suggestions,
        classRequirements: [atLeast("Warrior", 1)],
        seed,
      });
      expect(picks[0].candidate.class).toBe("Warrior");
    }
  });

  it("no repite clase entre tanks si hay alternativa de otra clase", () => {
    const suggestions = buildSuggestions([
      { userId: "u1", username: "Uno", chars: [{ name: "dk1", class: "Death Knight", role: "tank" }] },
      { userId: "u2", username: "Dos", chars: [{ name: "dk2", class: "Death Knight", role: "tank", ilvl: 293 }] },
      { userId: "u3", username: "Tres", chars: [{ name: "pala", class: "Paladin", role: "tank", ilvl: 286 }] },
    ]);
    for (const seed of seeds(RUNS)) {
      const { picks } = generateAutomaticSelection({ roles: roles(2, 0, 0), suggestions, seed });
      const classes = picks.map((p) => p.candidate.class);
      expect(new Set(classes).size).toBe(2);
    }
  });

  it("reserva la clase obligatoria del contenido (Monje Heal) aunque cueste ilvl", () => {
    const suggestions = buildSuggestions([
      { userId: "u1", username: "Uno", chars: [{ name: "sham", class: "Shaman", role: "heal", ilvl: 293 }] },
      { userId: "u2", username: "Dos", chars: [{ name: "pri", class: "Priest", role: "heal", ilvl: 293 }] },
      { userId: "u3", username: "Tres", chars: [{ name: "monk", class: "Monk", role: "heal", ilvl: 286 }] },
    ]);
    for (const seed of seeds(RUNS)) {
      const { picks } = generateAutomaticSelection({
        roles: roles(0, 2, 0),
        suggestions,
        requiredRoleClasses: [{ role: "heal", class: "Monk", count: 1 }],
        seed,
      });
      expect(picks.filter((p) => p.role === "heal" && p.candidate.class === "Monk")).toHaveLength(1);
    }
  });

  it("mueve a alguien de rol para poder cubrir una clase pedida", () => {
    const suggestions = buildSuggestions([
      {
        userId: "u1",
        username: "hekyuz",
        chars: [
          { name: "dk", class: "Death Knight", role: "tank", isMainClass: true },
          { name: "mage", class: "Mage", role: "dps", isMainClass: false },
        ],
      },
      { userId: "u2", username: "Juno", chars: [{ name: "pala", class: "Paladin", role: "tank" }] },
      { userId: "u3", username: "Pax", chars: [{ name: "war", class: "Warrior", role: "dps" }] },
    ]);
    for (const seed of seeds(RUNS)) {
      const { picks } = generateAutomaticSelection({
        roles: roles(1, 0, 1),
        suggestions,
        classRequirements: [atLeast("Mage", 1)],
        seed,
      });
      expect(picks.filter((p) => p.candidate.class === "Mage")).toHaveLength(1);
      expect(picks).toHaveLength(2);
    }
  });

  it("usa una Off-Spec si es la única forma de cubrir una clase pedida", () => {
    const suggestions = buildSuggestions([
      { userId: "u1", username: "Uno", chars: [{ name: "hunt", class: "Hunter", role: "dps" }] },
      {
        userId: "u2",
        username: "Dos",
        chars: [{ name: "dru", class: "Druid", role: "dps", isOffSpec: true, isMainClass: false }],
      },
    ]);
    for (const seed of seeds(RUNS)) {
      const { picks } = generateAutomaticSelection({
        roles: roles(0, 0, 2),
        suggestions,
        classRequirements: [atLeast("Druid", 1)],
        seed,
      });
      expect(picks.filter((p) => p.candidate.class === "Druid")).toHaveLength(1);
    }
  });

  it("cumple un pedido de clase EXACTO sin pasarse ni quedarse corto", () => {
    const suggestions = buildSuggestions([
      { userId: "u1", username: "Uno", chars: [{ name: "pala1", class: "Paladin", role: "dps" }] },
      { userId: "u2", username: "Dos", chars: [{ name: "pala2", class: "Paladin", role: "dps" }] },
      { userId: "u3", username: "Tres", chars: [{ name: "hunt", class: "Hunter", role: "dps" }] },
    ]);
    for (const seed of seeds(RUNS)) {
      const { picks } = generateAutomaticSelection({
        roles: roles(0, 0, 2),
        suggestions,
        classRequirements: [exactly("Paladin", 1)],
        seed,
      });
      expect(picks.filter((p) => p.candidate.class === "Paladin")).toHaveLength(1);
    }
  });

  it("prefiere dejar un cupo vacío antes que repetir usuario, y llena todo lo posible", () => {
    const suggestions = buildSuggestions([
      { userId: "u1", username: "Uno", chars: [{ name: "a", class: "Mage", role: "dps" }] },
      { userId: "u2", username: "Dos", chars: [{ name: "b", class: "Hunter", role: "dps" }] },
    ]);
    for (const seed of seeds(RUNS)) {
      const { picks } = generateAutomaticSelection({ roles: roles(0, 0, 3), suggestions, seed });
      expect(picks).toHaveLength(2);
      expect(new Set(picks.map((p) => p.candidate.user_id)).size).toBe(2);
    }
  });

  it("llena un cupo de rol escaso aunque el único candidato ya esté usado en otro rol", () => {
    const suggestions = buildSuggestions([
      {
        userId: "hekyuz",
        username: "hekyuz",
        chars: [
          { name: "Thalor", class: "Death Knight", role: "tank", ilvl: 288, isOffSpec: true, isMainClass: false },
          { name: "Rennick", class: "Hunter", role: "dps", ilvl: 293, isMainClass: true },
        ],
      },
      ...Array.from({ length: 4 }, (_, i) => ({
        userId: `libre${i}`,
        username: `libre${i}`,
        chars: [{ name: `tk${i}`, class: "Warrior", role: "tank", isDayOff: true }],
      })),
      { userId: "d1", username: "d1", chars: [{ name: "dd1", class: "Mage", role: "dps" }] },
      { userId: "d2", username: "d2", chars: [{ name: "dd2", class: "Warlock", role: "dps" }] },
      {
        userId: "s1",
        username: "s1",
        chars: [{ name: "spare", class: "Druid", role: "dps", isOffSpec: true, isMainClass: false }],
      },
      { userId: "h1", username: "h1", chars: [{ name: "hh1", class: "Priest", role: "heal" }] },
    ]);

    for (const seed of seeds(RUNS)) {
      const { picks, diagnostics } = generateAutomaticSelection({
        roles: roles(2, 1, 3),
        suggestions,
        seed,
      });
      expect(picks).toHaveLength(5);
      expect(picks.filter((p) => p.role === "tank")).toHaveLength(1);
      expect(picks.filter((p) => p.role === "dps")).toHaveLength(3);
      expect(diagnostics.unfilledSlots).toEqual([{ role: "tank", count: 1 }]);
    }
  });

  it("encadena reasignaciones para llenar cupos vacíos", () => {
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
      { userId: "d1", username: "d1", chars: [{ name: "dd1", class: "Mage", role: "dps" }] },
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
      { userId: "h1", username: "h1", chars: [{ name: "hh1", class: "Priest", role: "heal" }] },
    ]);

    for (const seed of seeds(RUNS)) {
      const { picks, diagnostics } = generateAutomaticSelection({
        roles: roles(2, 1, 3),
        suggestions,
        seed,
      });
      expect(picks).toHaveLength(6);
      expect(diagnostics.unfilledSlots).toEqual([]);
    }
  });

  it("nunca elige a alguien con día libre (OT) por su cuenta", () => {
    const suggestions = buildSuggestions([
      { userId: "u1", username: "Libre", chars: [{ name: "a", class: "Mage", role: "dps", isDayOff: true, ilvl: 293 }] },
      { userId: "u2", username: "Dispo", chars: [{ name: "b", class: "Hunter", role: "dps", ilvl: 286 }] },
    ]);
    for (const seed of seeds(RUNS)) {
      const { picks } = generateAutomaticSelection({ roles: roles(0, 0, 2), suggestions, seed });
      expect(picks.every((p) => !p.candidate.isDayOff)).toBe(true);
      expect(picks).toHaveLength(1);
    }
  });

  it("respeta el cap de saved/unsaved", () => {
    const suggestions = buildSuggestions([
      { userId: "u1", username: "Uno", chars: [{ name: "a", class: "Mage", role: "dps", isSaved: true }] },
      { userId: "u2", username: "Dos", chars: [{ name: "b", class: "Hunter", role: "dps", isSaved: true }] },
      { userId: "u3", username: "Tres", chars: [{ name: "c", class: "Priest", role: "dps", isSaved: false }] },
    ]);
    for (const seed of seeds(RUNS)) {
      const { picks } = generateAutomaticSelection({
        roles: roles(0, 0, 3),
        suggestions,
        savedCap: 1,
        unsavedCap: 2,
        seed,
      });
      expect(picks.filter((p) => p.isSaved === true).length).toBeLessThanOrEqual(1);
    }
  });

  it("no se pasa del cap de saved ni siquiera cruzando cupos de roles distintos", () => {
    const suggestions = buildSuggestions([
      {
        userId: "u1",
        username: "Uno",
        chars: [
          { name: "t1", class: "Warrior", role: "tank", isSaved: true },
          { name: "d1", class: "Warrior", role: "dps", isSaved: true },
        ],
      },
      {
        userId: "u2",
        username: "Dos",
        chars: [
          { name: "t2", class: "Paladin", role: "tank", isSaved: true },
          { name: "d2", class: "Paladin", role: "dps", isSaved: true },
        ],
      },
      { userId: "u3", username: "Tres", chars: [{ name: "d3", class: "Mage", role: "dps", isSaved: false }] },
    ]);
    for (const seed of seeds(RUNS)) {
      const { picks } = generateAutomaticSelection({
        roles: roles(1, 0, 2),
        suggestions,
        savedCap: 1,
        unsavedCap: 5,
        seed,
      });
      expect(picks.filter((p) => p.isSaved === true).length).toBeLessThanOrEqual(1);
    }
  });

  it("se acerca al ilvl objetivo cuando el resto de prioridades empata", () => {
    const suggestions = buildSuggestions([
      { userId: "u1", username: "Uno", chars: [{ name: "a", class: "Mage", role: "dps", ilvl: 300 }] },
      { userId: "u2", username: "Dos", chars: [{ name: "b", class: "Hunter", role: "dps", ilvl: 286 }] },
    ]);
    const { picks } = generateAutomaticSelection({
      roles: roles(0, 0, 1),
      suggestions,
      targetAvgIlvl: 286,
      seed: 1,
    });
    expect(picks[0].candidate.ilvl).toBe(300);
  });

  it("devuelve un array vacío si no hay ningún candidato", () => {
    expect(generateAutomaticSelection({ roles: roles(2, 4, 12), suggestions: {} }).picks).toEqual([]);
  });

  describe("tiers de personaje", () => {
    it("nunca elige un personaje excluido, ni con el cupo vacío", () => {
      const suggestions = buildSuggestions([
        { userId: "u1", username: "Uno", chars: [{ name: "a", class: "Mage", role: "dps", tier: "excluido" }] },
      ]);
      for (const seed of seeds(RUNS)) {
        const { picks } = generateAutomaticSelection({ roles: roles(0, 0, 1), suggestions, seed });
        expect(picks).toHaveLength(0);
      }
    });

    it("no usa un personaje de último recurso si hay una alternativa normal", () => {
      const suggestions = buildSuggestions([
        {
          userId: "u1",
          username: "Uno",
          chars: [
            { name: "ultimo", class: "Mage", role: "dps", ilvl: 300, tier: "ultimo_recurso" },
            { name: "normal", class: "Mage", role: "dps", ilvl: 286 },
          ],
        },
      ]);
      for (const seed of seeds(RUNS)) {
        const { picks } = generateAutomaticSelection({ roles: roles(0, 0, 1), suggestions, seed });
        expect(picks[0].candidate.name).toBe("normal");
      }
    });

    it("usa un último recurso antes que dejar el cupo vacío", () => {
      const suggestions = buildSuggestions([
        { userId: "u1", username: "Uno", chars: [{ name: "ultimo", class: "Mage", role: "dps", tier: "ultimo_recurso" }] },
      ]);
      for (const seed of seeds(RUNS)) {
        const { picks } = generateAutomaticSelection({ roles: roles(0, 0, 1), suggestions, seed });
        expect(picks).toHaveLength(1);
        expect(picks[0].candidate.tier).toBe("ultimo_recurso");
      }
    });

    it("prefiere un personaje marcado como preferido por encima del ilvl", () => {
      const suggestions = buildSuggestions([
        {
          userId: "u1",
          username: "Uno",
          chars: [
            { name: "pref", class: "Mage", role: "dps", ilvl: 286, tier: "preferido" },
            { name: "alto", class: "Mage", role: "dps", ilvl: 310 },
          ],
        },
      ]);
      for (const seed of seeds(RUNS)) {
        const { picks } = generateAutomaticSelection({ roles: roles(0, 0, 1), suggestions, seed });
        expect(picks[0].candidate.name).toBe("pref");
      }
    });
  });

  describe("parámetros que antes no hacían nada", () => {
    it("penaliza quedar por debajo del ilvl mínimo del rol, sin dejar el cupo vacío", () => {
      const suggestions = buildSuggestions([
        { userId: "u1", username: "Bajo", chars: [{ name: "a", class: "Mage", role: "dps", ilvl: 280 }] },
        { userId: "u2", username: "Ok", chars: [{ name: "b", class: "Mage", role: "dps", ilvl: 290 }] },
      ]);
      for (const seed of seeds(RUNS)) {
        const { picks } = generateAutomaticSelection({ roles: roles(0, 0, 1), suggestions, seed });
        expect(picks[0].candidate.ilvl).toBe(290);
      }
      const { picks } = generateAutomaticSelection({ roles: roles(0, 0, 2), suggestions, seed: 3 });
      expect(picks).toHaveLength(2);
    });

    it("prefiere gente con mochila cuando se piden mochilas", () => {
      const suggestions = buildSuggestions([
        { userId: "u1", username: "Con", chars: [{ name: "a", class: "Mage", role: "dps", hasMochila: true, ilvl: 286 }] },
        { userId: "u2", username: "Sin", chars: [{ name: "b", class: "Mage", role: "dps", ilvl: 300 }] },
      ]);
      for (const seed of seeds(RUNS)) {
        const { picks } = generateAutomaticSelection({
          roles: roles(0, 0, 1),
          suggestions,
          mochilasNeeded: 1,
          seed,
        });
        expect(picks[0].candidate.hasMochila).toBe(true);
      }
    });

    it("a igualdad de todo, elige a quien menos veces llevó mochila", () => {
      const suggestions = buildSuggestions([
        { userId: "u1", username: "Muchas", chars: [{ name: "a", class: "Mage", role: "dps", hasMochila: true, mochilaCount: 9 }] },
        { userId: "u2", username: "Pocas", chars: [{ name: "b", class: "Mage", role: "dps", hasMochila: true, mochilaCount: 0 }] },
      ]);
      for (const seed of seeds(RUNS)) {
        const { picks } = generateAutomaticSelection({
          roles: roles(0, 0, 1),
          suggestions,
          mochilasNeeded: 1,
          seed,
        });
        expect(picks[0].candidate.mochilaCount).toBe(0);
      }
    });

    it("puede pedir una spec concreta y no solo una clase", () => {
      const suggestions = buildSuggestions([
        { userId: "u1", username: "Devo", chars: [{ name: "a", class: "Evoker", role: "dps", spec: "Devastation" }] },
        { userId: "u2", username: "Aug", chars: [{ name: "b", class: "Evoker", role: "dps", spec: "Augmentation" }] },
      ]);
      for (const seed of seeds(RUNS)) {
        const { picks } = generateAutomaticSelection({
          roles: roles(0, 0, 1),
          suggestions,
          classRequirements: [{ class: "Evoker", min: 1, max: null, spec: "Augmentation" }],
          seed,
        });
        expect(picks[0].candidate.specUsed).toBe("Augmentation");
      }
    });

    it("evita apilar de más una clase que nadie pidió", () => {
      const many = Array.from({ length: 6 }, (_, i) => ({
        userId: `p${i}`,
        username: `p${i}`,
        chars: [{ name: `pala${i}`, class: "Paladin", role: "dps", ilvl: 300 }],
      }));
      const others = Array.from({ length: 6 }, (_, i) => ({
        userId: `h${i}`,
        username: `h${i}`,
        chars: [{ name: `hunt${i}`, class: "Hunter", role: "dps", ilvl: 286 }],
      }));
      const suggestions = buildSuggestions([...many, ...others]);
      for (const seed of seeds(RUNS)) {
        const { picks } = generateAutomaticSelection({
          roles: roles(0, 0, 6),
          suggestions,
          maxSameClass: 3,
          seed,
        });
        expect(picks.filter((p) => p.candidate.class === "Paladin").length).toBeLessThanOrEqual(3);
      }
    });
  });

  describe("determinismo", () => {
    const suggestions = buildSuggestions([
      { userId: "u1", username: "Uno", chars: [{ name: "a", class: "Mage", role: "dps" }, { name: "a2", class: "Hunter", role: "dps" }] },
      { userId: "u2", username: "Dos", chars: [{ name: "b", class: "Priest", role: "heal" }] },
      { userId: "u3", username: "Tres", chars: [{ name: "c", class: "Warrior", role: "tank" }] },
      { userId: "u4", username: "Cuatro", chars: [{ name: "d", class: "Druid", role: "dps" }] },
    ]);

    it("la misma semilla y el mismo input dan exactamente el mismo roster", () => {
      const input = { roles: roles(1, 1, 2), suggestions, seed: 12345 };
      const a = generateAutomaticSelection(input).picks.map((p) => `${p.role}:${p.candidate.id}`);
      const b = generateAutomaticSelection(input).picks.map((p) => `${p.role}:${p.candidate.id}`);
      expect(a).toEqual(b);
    });

  });

  describe("variedad sin semilla explícita", () => {
    it("entre varios personajes dentro de la banda competente, no siempre elige el mismo", () => {
      const users = Array.from({ length: 11 }, (_, i) => ({
        userId: `u${i}`,
        username: `u${i}`,
        chars: [{ name: `d${i}`, class: "Druid", role: "heal", ilvl: 285 + i }],
      }));
      const suggestions = buildSuggestions(users);

      const picked = new Set<string>();
      for (let i = 0; i < 30; i++) {
        const { picks } = generateAutomaticSelection({ roles: roles(0, 1, 0), suggestions });
        picked.add(picks[0].candidate.id);
      }
      expect(picked.size).toBeGreaterThan(1);
    });

    it("nunca elige a alguien claramente por debajo de la banda si hay alternativas competentes", () => {
      const suggestions = buildSuggestions([
        { userId: "u1", username: "Bajo", chars: [{ name: "a", class: "Druid", role: "heal", ilvl: 200 }] },
        ...Array.from({ length: 5 }, (_, i) => ({
          userId: `u${i + 2}`,
          username: `u${i + 2}`,
          chars: [{ name: `d${i}`, class: "Druid", role: "heal", ilvl: 288 + i }],
        })),
      ]);
      for (let i = 0; i < 20; i++) {
        const { picks } = generateAutomaticSelection({ roles: roles(0, 1, 0), suggestions });
        expect(picks[0].candidate.ilvl).toBeGreaterThan(200);
      }
    });
  });

  describe("diagnósticos", () => {
    it("reporta cupos vacíos y clases sin cubrir", () => {
      const suggestions = buildSuggestions([
        { userId: "u1", username: "Uno", chars: [{ name: "a", class: "Mage", role: "dps" }] },
      ]);
      const { diagnostics } = generateAutomaticSelection({
        roles: roles(0, 0, 3),
        suggestions,
        classRequirements: [atLeast("Warlock", 2)],
        seed: 1,
      });
      expect(diagnostics.unfilledSlots).toEqual([{ role: "dps", count: 2 }]);
      expect(diagnostics.unmetClassMins).toEqual([{ class: "Warlock", needed: 2, got: 0 }]);
    });

    it("explica por qué alguien salió fuera de su clase main", () => {
      const suggestions = buildSuggestions([
        {
          userId: "u1",
          username: "aure",
          chars: [
            { name: "dh", class: "Demon Hunter", role: "tank", isMainClass: true },
            { name: "war", class: "Warrior", role: "tank", isMainClass: false },
          ],
        },
      ]);
      const { diagnostics } = generateAutomaticSelection({
        roles: roles(1, 0, 0),
        suggestions,
        classRequirements: [atLeast("Warrior", 1)],
        seed: 1,
      });
      expect(diagnostics.offMainClassUsed).toHaveLength(1);
      expect(diagnostics.offMainClassUsed[0]).toMatchObject({
        discordUsername: "aure",
        playedClass: "Warrior",
        mainClasses: ["Demon Hunter"],
      });
      expect(diagnostics.offMainClassUsed[0].reason).toContain("clase pedida");
    });

    it("cuenta los personajes sin clase sincronizada", () => {
      const suggestions: AutoGenerateInput["suggestions"] = {
        dps: [
          {
            user_id: "u1",
            discord_username: "Uno",
            characters: [
              { ...char("u1", "Uno", { name: "a", class: "Mage", role: "dps" }), class: null, ownerMainClasses: [], isMainClass: false },
            ],
          },
        ],
      };
      const { diagnostics } = generateAutomaticSelection({ roles: roles(0, 0, 1), suggestions, seed: 1 });
      expect(diagnostics.charactersWithoutClass).toBe(1);
    });

    it("expone el vector de criterios completo", () => {
      const suggestions = buildSuggestions([
        { userId: "u1", username: "Uno", chars: [{ name: "a", class: "Mage", role: "dps" }] },
      ]);
      const { diagnostics } = generateAutomaticSelection({ roles: roles(0, 0, 1), suggestions, seed: 1 });
      expect(diagnostics.scoreVector[0]).toEqual({ name: "unfilledSlots", value: 0 });
      expect(diagnostics.scoreVector.map((c) => c.name)).toContain("offMainClass");
    });
  });
});
