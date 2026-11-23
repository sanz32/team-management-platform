import { GUILD_TIMEZONE } from "@/lib/guild-day";
import { shiftDateKey, zonedDateKey, zonedParts, zonedTimeToUtc } from "@/lib/timezone";

export type GoalType = "characters" | "avg_ilvl";

export interface GoalTarget {
  goalType: GoalType;
  target: number;
  minIlvl: number | null;
  onlyMains: boolean;
  deadlineOffsetMinutes: number | null;
}

export interface GoalCharacterInput {
  ilvl: number | null;
  class: string | null;
}

export function countCharactersForGoal(
  characters: GoalCharacterInput[],
  goal: GoalTarget | undefined,
  mainClasses: Set<string> | undefined
): number {
  if (!goal) return characters.length;
  return characters.filter((c) => {
    if (goal.minIlvl != null && (c.ilvl ?? 0) < goal.minIlvl) return false;
    if (goal.onlyMains && (!c.class || !mainClasses?.has(c.class))) return false;
    return true;
  }).length;
}

export function computeAverageIlvl(
  characters: GoalCharacterInput[],
  mainClasses?: Set<string>,
  topN?: number
): number {
  const pool = mainClasses ? characters.filter((c) => c.class && mainClasses.has(c.class)) : characters;
  const withIlvl = pool.filter((c) => c.ilvl);
  const considered =
    topN != null ? withIlvl.slice().sort((a, b) => (b.ilvl ?? 0) - (a.ilvl ?? 0)).slice(0, topN) : withIlvl;
  return considered.length
    ? Math.round(considered.reduce((sum, c) => sum + (c.ilvl ?? 0), 0) / considered.length)
    : 0;
}

export function ilvlGoalUsesMains(goals: GoalTarget[]): boolean {
  return goals.find((g) => g.goalType === "characters")?.onlyMains ?? false;
}

export function ilvlGoalTopN(goals: GoalTarget[]): number | undefined {
  return goals.find((g) => g.goalType === "characters")?.target;
}

export const MINUTES_PER_WEEK = 7 * 24 * 60;
const MS_PER_MINUTE = 60 * 1000;
const MS_PER_DAY = 24 * 60 * MS_PER_MINUTE;

export function resolveGoalDeadline(weekStart: Date, offsetMinutes: number | null): Date {
  const minutes = offsetMinutes ?? MINUTES_PER_WEEK;
  return new Date(weekStart.getTime() + minutes * MS_PER_MINUTE);
}

export const MAX_DEADLINE_DAY_INDEX = 6;

export function goalDeadlineOffsetFromZoned(
  weekStart: Date,
  dayIndex: number,
  time: string
): number {
  const dateKey = shiftDateKey(zonedDateKey(weekStart, GUILD_TIMEZONE), dayIndex);
  const instant = zonedTimeToUtc(dateKey, time, GUILD_TIMEZONE);
  return Math.round((instant.getTime() - weekStart.getTime()) / MS_PER_MINUTE);
}

export function goalDeadlineZonedParts(
  weekStart: Date,
  offsetMinutes: number | null
): { dayIndex: number; time: string; dateKey: string } {
  const { dateKey, time } = zonedParts(resolveGoalDeadline(weekStart, offsetMinutes), GUILD_TIMEZONE);
  const resetDateKey = zonedDateKey(weekStart, GUILD_TIMEZONE);
  const dayIndex = Math.round(
    (Date.parse(`${dateKey}T00:00:00Z`) - Date.parse(`${resetDateKey}T00:00:00Z`)) / MS_PER_DAY
  );
  return { dayIndex, time, dateKey };
}

export interface GoalRules {
  target: number;
  minIlvl: number | null;
  onlyMains: boolean;
  topN: number | null;
}

export interface GoalHistoryEntry extends GoalRules {
  goalType: GoalType;
  weekStart: string;
  met: boolean;
}

export interface GoalDebt extends GoalRules {
  goalType: GoalType;
  weeks: number;
  sinceWeek: string;
  lastWeek: string;
}

export function computeGoalDebt(rows: GoalHistoryEntry[], goalType: GoalType): GoalDebt | null {
  const ordered = rows
    .filter((r) => r.goalType === goalType)
    .sort((a, b) => (a.weekStart < b.weekStart ? 1 : a.weekStart > b.weekStart ? -1 : 0));

  const unmet: GoalHistoryEntry[] = [];
  for (const row of ordered) {
    if (row.met) break;
    unmet.push(row);
  }
  if (unmet.length === 0) return null;

  const pending = unmet[0];
  return {
    goalType,
    weeks: unmet.length,
    target: pending.target,
    minIlvl: pending.minIlvl,
    onlyMains: pending.onlyMains,
    topN: pending.topN,
    sinceWeek: unmet[unmet.length - 1].weekStart,
    lastWeek: pending.weekStart,
  };
}

export function currentValueForRules(
  goalType: GoalType,
  characters: GoalCharacterInput[],
  rules: GoalRules,
  mainClasses: Set<string> | undefined
): number {
  if (goalType === "characters") {
    return countCharactersForGoal(
      characters,
      { goalType, target: rules.target, minIlvl: rules.minIlvl, onlyMains: rules.onlyMains, deadlineOffsetMinutes: null },
      mainClasses
    );
  }
  return computeAverageIlvl(
    characters,
    rules.onlyMains ? mainClasses : undefined,
    rules.topN ?? undefined
  );
}

export function isGoalDebtSettled(
  debt: GoalDebt,
  characters: GoalCharacterInput[],
  mainClasses: Set<string> | undefined
): boolean {
  return currentValueForRules(debt.goalType, characters, debt, mainClasses) >= debt.target;
}


export interface GoalCloseSummary {
  weekStart: string;
  evaluated: number;
  goals: (GoalRules & {
    goalType: GoalType;
    met: number;
    total: number;
    unmetUserIds: string[];
  })[];
}

export const GOAL_TYPE_LABELS: Record<GoalType, string> = {
  characters: "Personajes",
  avg_ilvl: "ilvl promedio",
};

export function describeGoalRules(goalType: GoalType, rules: GoalRules): string {
  if (goalType === "avg_ilvl") {
    const tope = rules.topN != null ? ` (los ${rules.topN} de más ilvl)` : "";
    return `ilvl promedio ${rules.target}${tope}`;
  }
  const piso = rules.minIlvl != null ? ` con ilvl ${rules.minIlvl}+` : "";
  const mains = rules.onlyMains ? ", solo clases main" : "";
  return `${rules.target} personaje${rules.target === 1 ? "" : "s"}${piso}${mains}`;
}

export interface MemberGoalDebt extends GoalDebt {
  userId: string;
}

export function settleGoalDebts(
  debts: MemberGoalDebt[],
  charactersByUser: Map<string, GoalCharacterInput[]>,
  mainClassesByUser: Map<string, Set<string>>
): MemberGoalDebt[] {
  return debts.filter(
    (debt) =>
      !isGoalDebtSettled(debt, charactersByUser.get(debt.userId) ?? [], mainClassesByUser.get(debt.userId))
  );
}

export function worstDebtForUser(debts: MemberGoalDebt[], userId: string): MemberGoalDebt | null {
  let worst: MemberGoalDebt | null = null;
  for (const entry of debts) {
    if (entry.userId !== userId) continue;
    if (!worst || entry.weeks > worst.weeks) worst = entry;
  }
  return worst;
}

export type GoalDebtSeverity = "none" | "leve" | "medio" | "grave";

export function goalDebtSeverity(weeks: number): GoalDebtSeverity {
  if (weeks <= 0) return "none";
  if (weeks === 1) return "leve";
  if (weeks === 2) return "medio";
  return "grave";
}
