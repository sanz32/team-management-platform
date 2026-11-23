export interface WowAccountLabel {
  index: number;
  full: string;
  color: string;
}

const WOW_ACCOUNT_COLORS: Record<number, string> = {
  1: "var(--color-primary)",
  2: "var(--color-secondary)",
  3: "var(--color-epic)",
  4: "var(--color-success)",
  5: "var(--color-danger)",
  6: "var(--color-warning)",
  7: "#2dd4bf",
};

export function wowAccountColor(index: number): string {
  return WOW_ACCOUNT_COLORS[index] ?? "var(--color-ink-faint)";
}

export function buildWowAccountLabels(
  wowAccountNumbers: (number | null | undefined)[]
): Map<number, WowAccountLabel> {
  const unique = Array.from(
    new Set(wowAccountNumbers.filter((n): n is number => typeof n === "number"))
  );

  const map = new Map<number, WowAccountLabel>();
  if (unique.length < 2) return map;

  for (const index of unique) {
    map.set(index, { index, full: `Cuenta WoW ${index}`, color: wowAccountColor(index) });
  }
  return map;
}
