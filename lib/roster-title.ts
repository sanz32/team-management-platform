import { RaidDef, Difficulty, DIFFICULTIES } from "./raids";

export interface RosterContentSummary {
  raidKeys: string[];
  difficulty: Difficulty;
}

const DIFFICULTY_LABEL: Record<Difficulty, string> = Object.fromEntries(
  DIFFICULTIES.map((d) => [d.key, d.label])
) as Record<Difficulty, string>;

export function contentRaidLabel(raidKeys: string[], raids: Pick<RaidDef, "key" | "name">[]): string {
  return raidKeys
    .map((k) => raids.find((r) => r.key === k)?.name)
    .filter((n): n is string => Boolean(n))
    .join(" + ");
}

export function formatRosterTitle(
  scheduledForISO: string,
  content: RosterContentSummary | null | undefined,
  raids: Pick<RaidDef, "key" | "name">[]
): string {
  const d = new Date(scheduledForISO);
  const weekday = d.toLocaleDateString("es-ES", { weekday: "long" });
  const day = d.getDate();
  const month = d.toLocaleDateString("es-ES", { month: "long" });
  const time = d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", hour12: false });
  const dateTime = `${weekday} ${day} de ${month} ${time}`;

  if (!content?.raidKeys?.length) {
    return `Roster para ${dateTime}`;
  }

  const raidPart = contentRaidLabel(content.raidKeys, raids);
  const diffPart = DIFFICULTY_LABEL[content.difficulty] ?? content.difficulty;
  return `Roster para ${raidPart} ${diffPart} ${dateTime}`;
}
