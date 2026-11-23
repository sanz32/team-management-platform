export const CLASS_COLORS: Record<string, string> = {
  "Death Knight": "#C41F3B",
  "Demon Hunter": "#A330C9",
  Druid: "#FF7D0A",
  Evoker: "#33937F",
  Hunter: "#AAD372",
  Mage: "#69CCF0",
  Monk: "#00FF96",
  Paladin: "#F48CBA",
  Priest: "#FFFFFF",
  Rogue: "#FFF468",
  Shaman: "#0070DE",
  Warlock: "#9482C9",
  Warrior: "#C79C6E",
};

export function classColor(className: string | null | undefined): string {
  if (!className) return "#8a8398";
  return CLASS_COLORS[className] ?? "#8a8398";
}

export function classGlow(className: string | null | undefined, alpha = 0.35): string {
  const hex = classColor(className);
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const CLASS_ORDER = [
  "Warrior",
  "Paladin",
  "Hunter",
  "Rogue",
  "Priest",
  "Death Knight",
  "Shaman",
  "Mage",
  "Warlock",
  "Monk",
  "Druid",
  "Demon Hunter",
  "Evoker",
];

export function classOrderIndex(className: string | null | undefined): number {
  if (!className) return CLASS_ORDER.length;
  const idx = CLASS_ORDER.indexOf(className);
  return idx === -1 ? CLASS_ORDER.length : idx;
}

export const ALL_CLASSES = CLASS_ORDER;

const SPEC_SHORT: Record<string, Record<string, string>> = {
  Warrior: { Arms: "War-Arms", Fury: "War-Fury", Protection: "War-Prot" },
  Paladin: { Holy: "Pala-Holy", Protection: "Pala-Prot", Retribution: "Pala-Ret" },
  Hunter: { "Beast Mastery": "Hunter-BM", Marksmanship: "Hunter-MM", Survival: "Hunter-Surv" },
  Rogue: { Assassination: "Rogue-Sin", Outlaw: "Rogue-Outlaw", Subtlety: "Rogue-Sub" },
  Priest: { Discipline: "Priest-Disc", Holy: "Priest-Holy", Shadow: "Priest-Shadow" },
  Shaman: { Elemental: "Sham-Ele", Enhancement: "Sham-Enh", Restoration: "Sham-Resto" },
  Mage: { Arcane: "Mage-Arcane", Fire: "Mage-Fire", Frost: "Mage-Frost" },
  Warlock: { Affliction: "Lock-Affli", Demonology: "Lock-Demo", Destruction: "Lock-Destro" },
  Monk: { Brewmaster: "Monk-Brew", Mistweaver: "Monk-MW", Windwalker: "Monk-WW" },
  Druid: {
    Balance: "Druid-Boomkin",
    Feral: "Druid-Feral",
    Guardian: "Druid-Guardian",
    Restoration: "Druid-Resto",
  },
  "Demon Hunter": { Havoc: "DH-Havoc", Vengeance: "DH-Veng", Devourer: "DH-Devo" },
  "Death Knight": { Blood: "DK-Blood", Frost: "DK-Frost", Unholy: "DK-Unholy" },
  Evoker: { Devastation: "Evoker-Devo", Preservation: "Evoker-Pres", Augmentation: "Evoker-Aug" },
};

export function shortSpec(
  className: string | null | undefined,
  spec: string | null | undefined
): string {
  if (!className) return spec ?? "-";
  if (!spec) return className;
  return SPEC_SHORT[className]?.[spec] ?? `${className} · ${spec}`;
}

export function classShort(className: string | null | undefined): string {
  if (!className) return "";
  const specs = SPEC_SHORT[className];
  const firstCode = specs ? Object.values(specs)[0] : undefined;
  return firstCode ? firstCode.split("-")[0] : className;
}

export function classSpecs(className: string | null | undefined): string[] {
  if (!className) return [];
  return Object.keys(SPEC_SHORT[className] ?? {});
}

export function wclClassNameToDisplay(wclClassName: string): string {
  return wclClassName.replace(/([a-z])([A-Z])/g, "$1 $2");
}

const CLASS_BANNER_SLUG: Record<string, string> = {
  Warrior: "warrior",
  Paladin: "paladin",
  Hunter: "hunter",
  Rogue: "rogue",
  Priest: "priest",
  "Death Knight": "death-knight",
  Shaman: "shaman",
  Mage: "mage",
  Warlock: "warlock",
  Monk: "monk",
  Druid: "druid",
  "Demon Hunter": "demon-hunter",
  Evoker: "evoker",
};

export function classBannerUrl(className: string | null | undefined): string | null {
  if (!className) return null;
  const slug = CLASS_BANNER_SLUG[className];
  return slug ? `/brand/class-banners/${slug}.jpg` : null;
}

const TANK_SPECS = new Set(["blood", "guardian", "protection", "vengeance", "brewmaster"]);
const HEAL_SPECS = new Set(["holy", "discipline", "restoration", "mistweaver", "preservation"]);

export function specRole(spec: string | null | undefined): "tank" | "heal" | "dps" {
  if (!spec) return "dps";
  const s = spec.toLowerCase();
  if (TANK_SPECS.has(s)) return "tank";
  if (HEAL_SPECS.has(s)) return "heal";
  return "dps";
}
