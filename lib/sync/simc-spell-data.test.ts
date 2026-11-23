import { describe, expect, it } from "vitest";
import { parseSimcSpellDataDump } from "./simc-spell-data";

const FIXTURE = `SimulationCraft 1125-01 for World of Warcraft 11.2.7.64772 Live
Name             : Block (desc=Passive) (id=107) [Passive]
Class            : Warrior, Paladin, Shaman
School           : Physical
Spell Type       : Magic
Attributes       : Is Ability (4), Passive (6)
Effects          :
#1 (id=69)       : Block (23)
                   Base Value: 3.5 | Scaled Value: 3.5 | Misc Value: 90
Description      : Gives a chance to block enemy melee and ranged attacks.

Name             : Devotion Aura (id=465) [Spell Family (10)]
Class            : Paladin
School           : Holy
Spell Type       : None
GCD              : 1.5 seconds
Duration         : Aura (infinite)
Labels           : 16: Class Spells
Effects          :
#1 (id=195)      : Apply Aura Raid (65) | Modify Damage Taken% (87)
                   Base Value: -3 | Scaled Value: -3 | Misc Value: 0x7f | Radius: 40 yards | Target: Self (1)
Description      : Party and raid members within $a1 yds are bolstered by their devotion.

Name             : Ironbark (id=102342) [Spell Family (7)]
Talent Entry     : Restoration [tree=spec, row=5, col=3, max_rank=1, req_points=8]
Class            : Druid
School           : Nature
Spell Type       : Magic
Spell Level      : 12
Range            : 40 yards
Duration         : 12 seconds
Cooldown         : 90 seconds
Labels           : 16: Class Spells

Name             : Divine Protection (id=498) [Spell Family (10)]
Class            : Holy Paladin
School           : Holy
Spell Type       : None
Spell Level      : 26
Duration         : 8 seconds
Cooldown         : 60 seconds
Labels           : 16: Class Spells
`;

describe("parseSimcSpellDataDump", () => {
  it("extrae id, nombre y clases de cada spell", () => {
    const records = parseSimcSpellDataDump(FIXTURE);
    expect(records).toHaveLength(4);

    const block = records.find((r) => r.spellId === 107);
    expect(block?.name).toBe("Block (desc=Passive)");
    expect(block?.classes).toEqual(["Warrior", "Paladin", "Shaman"]);
  });

  it("parsea Duration y Cooldown en segundos cuando son numéricos", () => {
    const records = parseSimcSpellDataDump(FIXTURE);
    const ironbark = records.find((r) => r.spellId === 102342);
    expect(ironbark).toEqual({
      spellId: 102342,
      name: "Ironbark",
      classes: ["Druid"],
      durationSeconds: 12,
      cooldownSeconds: 90,
    });
  });

  it("devuelve null para Duration no numérica (aura pasiva permanente)", () => {
    const records = parseSimcSpellDataDump(FIXTURE);
    const devotionAura = records.find((r) => r.spellId === 465);
    expect(devotionAura?.durationSeconds).toBeNull();
    expect(devotionAura?.cooldownSeconds).toBeNull();
  });

  it("preserva el calificador de spec en el campo Class (ej. 'Holy Paladin')", () => {
    const records = parseSimcSpellDataDump(FIXTURE);
    const divineProtection = records.find((r) => r.spellId === 498);
    expect(divineProtection?.classes).toEqual(["Holy Paladin"]);
    expect(divineProtection?.durationSeconds).toBe(8);
    expect(divineProtection?.cooldownSeconds).toBe(60);
  });

  it("ignora bloques sin un id de spell (encabezado del archivo)", () => {
    const records = parseSimcSpellDataDump("SimulationCraft 1125-01 for World of Warcraft 11.2.7\n\n");
    expect(records).toEqual([]);
  });
});
