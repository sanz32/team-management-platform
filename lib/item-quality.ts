const QUALITY_COLORS: Record<string, string> = {
  POOR: "#9d9d9d",
  COMMON: "#ffffff",
  UNCOMMON: "#1eff00",
  RARE: "#0070dd",
  EPIC: "#a335ee",
  LEGENDARY: "#ff8000",
  ARTIFACT: "#e6cc80",
  HEIRLOOM: "#00ccff",
};

export function qualityColor(quality: string | null | undefined): string {
  if (!quality) return QUALITY_COLORS.COMMON;
  return QUALITY_COLORS[quality.toUpperCase()] ?? QUALITY_COLORS.COMMON;
}
