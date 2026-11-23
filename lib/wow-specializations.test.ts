import { describe, expect, it } from "vitest";
import { matchSpecByProviderText, type WowSpecialization } from "./wow-specializations";

const ALL_SPECS: WowSpecialization[] = [
  { specId: 253, className: "Hunter", specName: "Beast Mastery", role: "dps", iconUrl: null },
  { specId: 254, className: "Hunter", specName: "Marksmanship", role: "dps", iconUrl: null },
  { specId: 255, className: "Hunter", specName: "Survival", role: "dps", iconUrl: null },
  { specId: 65, className: "Paladin", specName: "Holy", role: "heal", iconUrl: null },
  { specId: 66, className: "Paladin", specName: "Protection", role: "tank", iconUrl: null },
  { specId: 70, className: "Paladin", specName: "Retribution", role: "dps", iconUrl: null },
  { specId: 256, className: "Priest", specName: "Discipline", role: "heal", iconUrl: null },
  { specId: 257, className: "Priest", specName: "Holy", role: "heal", iconUrl: null },
  { specId: 258, className: "Priest", specName: "Shadow", role: "dps", iconUrl: null },
  { specId: 64, className: "Mage", specName: "Frost", role: "dps", iconUrl: null },
];

describe("matchSpecByProviderText", () => {
  it("matchea el formato de Raidbots (solo el nombre de la spec)", () => {
    const match = matchSpecByProviderText(ALL_SPECS, "Mage", "Frost");
    expect(match?.specId).toBe(64);
  });

  it("matchea el formato de QE Live (spec + clase juntos)", () => {
    const match = matchSpecByProviderText(ALL_SPECS, "Paladin", "Holy Paladin");
    expect(match?.specId).toBe(65);
  });

  it("no confunde specs con el mismo nombre en clases distintas (Holy Paladin vs Holy Priest)", () => {
    const paladinMatch = matchSpecByProviderText(ALL_SPECS, "Paladin", "Holy Paladin");
    const priestMatch = matchSpecByProviderText(ALL_SPECS, "Priest", "Holy Priest");
    expect(paladinMatch?.specId).toBe(65);
    expect(priestMatch?.specId).toBe(257);
  });

  it("devuelve null si la clase no tiene esa spec", () => {
    expect(matchSpecByProviderText(ALL_SPECS, "Mage", "Holy")).toBeNull();
  });

  it("devuelve null si la clase no existe en la lista", () => {
    expect(matchSpecByProviderText(ALL_SPECS, "Druid", "Restoration")).toBeNull();
  });

  it("matchea sin importar mayusculas/minusculas (bug real: Raidbots mando 'retribution' en minusculas)", () => {
    const match = matchSpecByProviderText(ALL_SPECS, "Paladin", "retribution");
    expect(match?.specId).toBe(70);
  });

  it("case-insensitive tambien con el formato de QE Live (spec+clase)", () => {
    const match = matchSpecByProviderText(ALL_SPECS, "Priest", "holy priest");
    expect(match?.specId).toBe(257);
  });
});
