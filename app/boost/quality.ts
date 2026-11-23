import type { BoostCategory } from "@/lib/boost";

export const QUALITY_COLOR: Record<BoostCategory, string> = {
  normal: "var(--color-secondary)",
  heroic: "var(--color-epic)",
  mythic: "var(--color-primary)",
};

export const QUALITY_ORDER: BoostCategory[] = ["normal", "heroic", "mythic"];

export function qualityStyle(category: BoostCategory): React.CSSProperties {
  return { "--color-q": QUALITY_COLOR[category] } as React.CSSProperties;
}
