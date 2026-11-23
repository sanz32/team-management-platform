import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  ilvlGoalTopN,
  ilvlGoalUsesMains,
  type GoalRules,
  type GoalTarget,
  type GoalType,
} from "@/lib/goal-progress";

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

export interface SealedGoal extends GoalRules {
  goalType: GoalType;
  deadlineOffsetMinutes: number | null;
}

interface SealedRow {
  week_start: string;
  goal_type: GoalType;
  target: number;
  min_ilvl: number | null;
  only_mains: boolean;
  top_n: number | null;
  deadline_offset_minutes: number | null;
}

function toSealed(row: SealedRow): SealedGoal {
  return {
    goalType: row.goal_type,
    target: row.target,
    minIlvl: row.min_ilvl,
    onlyMains: row.only_mains,
    topN: row.top_n,
    deadlineOffsetMinutes: row.deadline_offset_minutes,
  };
}

export function goalsToSealed(goals: GoalTarget[]): SealedGoal[] {
  const usesMains = ilvlGoalUsesMains(goals);
  const topN = ilvlGoalTopN(goals);
  return goals.map((goal) => ({
    goalType: goal.goalType,
    target: goal.target,
    minIlvl: goal.goalType === "characters" ? goal.minIlvl : null,
    onlyMains: goal.goalType === "characters" ? goal.onlyMains : usesMains,
    topN: goal.goalType === "avg_ilvl" ? topN ?? null : null,
    deadlineOffsetMinutes: goal.deadlineOffsetMinutes,
  }));
}

function weekKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function sealGoalWeek(
  supabase: SupabaseClient,
  weekStart: Date,
  goals: GoalTarget[]
): Promise<void> {
  const week = weekKey(weekStart);
  const sealed = goalsToSealed(goals);

  const { error: deleteError } = await supabase
    .from("guild_goal_weeks")
    .delete()
    .eq("week_start", week);
  if (deleteError) console.error("Error limpiando el sello de la semana:", deleteError.message);

  if (sealed.length === 0) return;

  const { error } = await supabase.from("guild_goal_weeks").insert(
    sealed.map((s) => ({
      week_start: week,
      goal_type: s.goalType,
      target: s.target,
      min_ilvl: s.minIlvl,
      only_mains: s.onlyMains,
      top_n: s.topN,
      deadline_offset_minutes: s.deadlineOffsetMinutes,
      sealed_at: new Date().toISOString(),
    }))
  );
  if (error) console.error("Error sellando el objetivo de la semana:", error.message);
}

export async function getSealedGoalWeeks(
  supabase: SupabaseClient,
  weekKeys: string[]
): Promise<Map<string, SealedGoal>> {
  const map = new Map<string, SealedGoal>();
  if (weekKeys.length === 0) return map;

  const { data, error } = await supabase
    .from("guild_goal_weeks")
    .select("week_start, goal_type, target, min_ilvl, only_mains, top_n, deadline_offset_minutes")
    .in("week_start", weekKeys);

  if (error) {
    console.error("Error leyendo guild_goal_weeks:", error.message);
    return map;
  }

  for (const row of (data ?? []) as SealedRow[]) {
    map.set(`${row.week_start}:${row.goal_type}`, toSealed(row));
  }
  return map;
}

export function sealedGoalsForWeek(sealed: Map<string, SealedGoal>, week: string): SealedGoal[] {
  const out: SealedGoal[] = [];
  for (const goalType of ["characters", "avg_ilvl"] as GoalType[]) {
    const found = sealed.get(`${week}:${goalType}`);
    if (found) out.push(found);
  }
  return out;
}
