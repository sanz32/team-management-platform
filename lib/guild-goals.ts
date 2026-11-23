import { createServerSupabaseClient } from "@/lib/supabase-server";
import type { GoalTarget } from "@/lib/goal-progress";

export type { GoalType, GoalTarget, GoalCharacterInput } from "@/lib/goal-progress";
export { countCharactersForGoal, computeAverageIlvl, ilvlGoalUsesMains, ilvlGoalTopN } from "@/lib/goal-progress";

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

export const GOAL_TYPES: GoalTarget["goalType"][] = ["characters", "avg_ilvl"];

export async function getGoalTargets(supabase: SupabaseClient): Promise<GoalTarget[]> {
  const { data } = await supabase
    .from("guild_goals")
    .select("goal_type, target, min_ilvl, only_mains, deadline_offset_minutes");
  return (data ?? []).map((r) => ({
    goalType: r.goal_type as GoalTarget["goalType"],
    target: r.target as number,
    minIlvl: (r.min_ilvl as number | null) ?? null,
    onlyMains: (r.only_mains as boolean | null) ?? false,
    deadlineOffsetMinutes: (r.deadline_offset_minutes as number | null) ?? null,
  }));
}
