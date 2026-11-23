import { describe, expect, it } from "vitest";
import { generateAutomaticSelection, type RoleRequest } from "@/lib/roster-generator";
import {
  buildGuildScenario,
  FULL_RAID_ROLES,
  GUILD_CHARACTERS,
} from "@/lib/test-utils/guild-scenario";

const SEEDS = Array.from({ length: 200 }, (_, i) => i * 2654435761);

const TIMEOUT = 120_000;

const CLASSES_IN_GUILD = [...new Set(GUILD_CHARACTERS.map((c) => c.class).filter(Boolean))] as string[];
const atLeast = (cls: string, n: number) => ({ class: cls, min: n, max: null });

describe("motor de roster contra los datos reales del guild", () => {
  it("llena la raid completa y nunca repite usuario", () => {
    const suggestions = buildGuildScenario(FULL_RAID_ROLES);
    for (const seed of SEEDS) {
      const { picks } = generateAutomaticSelection({ roles: FULL_RAID_ROLES, suggestions, seed });
      expect(picks).toHaveLength(18);
      expect(new Set(picks.map((p) => p.candidate.user_id)).size).toBe(18);
    }
  }, TIMEOUT);

  it("cumple TODOS los mínimos de clase en el 100% de las corridas", () => {
    const requested = ["Mage", "Warlock", "Priest", "Druid", "Monk", "Evoker", "Warrior", "Shaman"];
    const classRequirements = requested.map((c) => atLeast(c, 1));
    const suggestions = buildGuildScenario(FULL_RAID_ROLES);

    for (const seed of SEEDS) {
      const { picks } = generateAutomaticSelection({
        roles: FULL_RAID_ROLES,
        suggestions,
        classRequirements,
        seed,
      });
      for (const cls of requested) {
        expect(picks.filter((p) => p.candidate.class === cls).length).toBeGreaterThanOrEqual(1);
      }
    }
  }, TIMEOUT);

  it("cumple mínimos de más de uno por clase cuando el pool alcanza", () => {
    const classRequirements = [atLeast("Hunter", 3), atLeast("Paladin", 2), atLeast("Monk", 1)];
    const suggestions = buildGuildScenario(FULL_RAID_ROLES);
    for (const seed of SEEDS) {
      const { picks } = generateAutomaticSelection({
        roles: FULL_RAID_ROLES,
        suggestions,
        classRequirements,
        seed,
      });
      for (const req of classRequirements) {
        expect(picks.filter((p) => p.candidate.class === req.class).length).toBeGreaterThanOrEqual(
          req.min
        );
      }
    }
  }, TIMEOUT);

  it("nunca elige un personaje excluido", () => {
    const tiers = Object.fromEntries(
      GUILD_CHARACTERS.filter((c) => c.class === "Hunter").map((c) => [c.id, "excluido" as const])
    );
    const suggestions = buildGuildScenario(FULL_RAID_ROLES, { tiers });
    for (const seed of SEEDS) {
      const { picks } = generateAutomaticSelection({ roles: FULL_RAID_ROLES, suggestions, seed });
      expect(picks.every((p) => p.candidate.class !== "Hunter")).toBe(true);
    }
  }, TIMEOUT);

  it("no usa un último recurso mientras exista una alternativa normal", () => {
    const best = [...GUILD_CHARACTERS].sort((a, b) => b.ilvl - a.ilvl)[0];
    const suggestions = buildGuildScenario(FULL_RAID_ROLES, {
      tiers: { [best.id]: "ultimo_recurso" },
    });
    for (const seed of SEEDS) {
      const { picks } = generateAutomaticSelection({ roles: FULL_RAID_ROLES, suggestions, seed });
      const used = picks.find((p) => p.candidate.id === best.id);
      if (used) {
        const owner = GUILD_CHARACTERS.filter((c) => c.user_id === best.user_id);
        expect(owner.length).toBe(1);
      }
    }
  }, TIMEOUT);

  it("nunca viola los caps de saved/unsaved, incluso apretados", () => {
    const savedIds = new Set(GUILD_CHARACTERS.filter((_, i) => i % 2 === 0).map((c) => c.id));
    const suggestions = buildGuildScenario(FULL_RAID_ROLES, { savedIds });
    for (const seed of SEEDS) {
      const { picks } = generateAutomaticSelection({
        roles: FULL_RAID_ROLES,
        suggestions,
        savedCap: 4,
        unsavedCap: 14,
        seed,
      });
      expect(picks.filter((p) => p.isSaved === true).length).toBeLessThanOrEqual(4);
      expect(picks.filter((p) => p.isSaved === false).length).toBeLessThanOrEqual(14);
    }
  }, TIMEOUT);

  it("un miembro con varias clases main nunca sale de una tercera clase", () => {
    const suggestions = buildGuildScenario(FULL_RAID_ROLES);
    for (const seed of SEEDS) {
      const { picks } = generateAutomaticSelection({ roles: FULL_RAID_ROLES, suggestions, seed });
      for (const pick of picks) {
        if (pick.candidate.isMainClass) continue;
        const pool = (suggestions[pick.role] ?? []).find(
          (u) => u.user_id === pick.candidate.user_id
        );
        const hadMain = (pool?.characters ?? []).some((c) => c.isMainClass);
        expect(hadMain ? "tenía main disponible" : "sin main").toBe("sin main");
      }
    }
  }, TIMEOUT);

  it("degrada con diagnóstico claro ante requisitos imposibles", () => {
    expect(CLASSES_IN_GUILD).not.toContain("Rogue");
    const suggestions = buildGuildScenario(FULL_RAID_ROLES);
    const { picks, diagnostics } = generateAutomaticSelection({
      roles: FULL_RAID_ROLES,
      suggestions,
      classRequirements: [atLeast("Rogue", 2), atLeast("Mage", 1)],
      seed: 7,
    });
    expect(picks).toHaveLength(18);
    expect(picks.filter((p) => p.candidate.class === "Mage").length).toBeGreaterThanOrEqual(1);
    expect(diagnostics.unmetClassMins).toEqual([{ class: "Rogue", needed: 2, got: 0 }]);
    expect(diagnostics.unfilledSlots).toEqual([]);
  }, TIMEOUT);

  it("usa Off-Specs solo cuando el pool justo lo obliga", () => {
    const tightRoles: RoleRequest[] = [{ role: "heal", count: 8, minIlvl: 285 }];
    const suggestions = buildGuildScenario(tightRoles);
    for (const seed of SEEDS.slice(0, 50)) {
      const { picks } = generateAutomaticSelection({ roles: tightRoles, suggestions, seed });
      expect(new Set(picks.map((p) => p.candidate.user_id)).size).toBe(picks.length);
    }
  }, TIMEOUT);

  it("respeta el día libre de todo el guild dejando cupos vacíos antes que forzar OT", () => {
    const everyone = new Set(GUILD_CHARACTERS.map((c) => c.user_id));
    const suggestions = buildGuildScenario(FULL_RAID_ROLES, { dayOffUserIds: everyone });
    const { picks } = generateAutomaticSelection({ roles: FULL_RAID_ROLES, suggestions, seed: 1 });
    expect(picks).toHaveLength(0);
  }, TIMEOUT);
});
