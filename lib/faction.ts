export const FACTION_COLORS: Record<string, string> = {
  Horde: "#C41E3A",
  Alliance: "#0078AE",
};

export function factionColor(faction: string | null | undefined): string {
  if (!faction) return "#8a8398";
  return FACTION_COLORS[faction] ?? "#8a8398";
}

export function factionLabel(faction: string | null | undefined): string | null {
  if (faction === "Horde") return "Horda";
  if (faction === "Alliance") return "Alianza";
  return null;
}

const FACTION_BANNER_SLUG: Record<string, string> = {
  Horde: "horde",
  Alliance: "alliance",
};

export function factionBannerUrl(faction: string | null | undefined): string | null {
  if (!faction) return null;
  const slug = FACTION_BANNER_SLUG[faction];
  return slug ? `/brand/faction-banners/${slug}.png` : null;
}
