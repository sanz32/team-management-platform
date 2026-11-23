import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getLockoutWeekStart } from "@/lib/wow-reset";
import { getMainClassesByUser } from "@/lib/main-classes";
import { getRemovedUserIds } from "@/lib/removed-members";
import { getFriendUserIds } from "@/lib/friend-members";
import { getGoalTargets } from "@/lib/guild-goals";
import {
  getSealedGoalWeeks,
  goalsToSealed,
  sealGoalWeek,
  sealedGoalsForWeek,
  type SealedGoal,
} from "@/lib/goal-weeks";
import {
  computeGoalDebt,
  currentValueForRules,
  resolveGoalDeadline,
  type GoalHistoryEntry,
  type GoalType,
  type GoalCloseSummary,
  type MemberGoalDebt,
} from "@/lib/goal-progress";

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

const GOAL_CLOSE_TTL_MS = 15 * 60 * 1000;

const CLOSE_STATE_KEY = "singleton";

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

const STREAK_WINDOW_WEEKS = 8;

function weekKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

interface CharacterRow {
  user_id: string;
  ilvl: number | null;
  class: string | null;
}

export async function closeElapsedGoalWeeksIfStale(supabase: SupabaseClient): Promise<void> {
  const { data: state, error: stateError } = await supabase
    .from("goal_close_state")
    .select("checked_at")
    .eq("key", CLOSE_STATE_KEY)
    .maybeSingle();

  if (stateError) {
    console.error("Error leyendo goal_close_state:", stateError.message);
  }

  const now = Date.now();
  if (state?.checked_at && now - new Date(state.checked_at).getTime() < GOAL_CLOSE_TTL_MS) return;

  const { error: claimError } = await supabase
    .from("goal_close_state")
    .upsert({ key: CLOSE_STATE_KEY, checked_at: new Date(now).toISOString() }, { onConflict: "key" });
  if (claimError) console.error("Error marcando goal_close_state:", claimError.message);

  try {
    await closeElapsedGoalWeeks(supabase, new Date(now));
  } catch (err) {
    console.error("Error cerrando semanas de objetivos:", err);
  }
}

async function resolveWeekGoals(
  supabase: SupabaseClient,
  currentWeekStart: Date,
  previousWeekStart: Date
): Promise<Map<string, SealedGoal[]>> {
  const currentKey = weekKey(currentWeekStart);
  const previousKey = weekKey(previousWeekStart);
  const sealed = await getSealedGoalWeeks(supabase, [previousKey, currentKey]);

  const byWeek = new Map<string, SealedGoal[]>();
  byWeek.set(currentKey, sealedGoalsForWeek(sealed, currentKey));
  byWeek.set(previousKey, sealedGoalsForWeek(sealed, previousKey));

  const needsFallback = byWeek.get(currentKey)!.length === 0 || byWeek.get(previousKey)!.length === 0;
  if (!needsFallback) return byWeek;

  const vigentesRaw = await getGoalTargets(supabase);
  const vigentes = goalsToSealed(vigentesRaw);
  if (vigentes.length === 0) return byWeek;

  if (byWeek.get(currentKey)!.length === 0) {
    byWeek.set(currentKey, vigentes);
    await sealGoalWeek(supabase, currentWeekStart, vigentesRaw);
  }
  if (byWeek.get(previousKey)!.length === 0) byWeek.set(previousKey, vigentes);

  return byWeek;
}

async function closeElapsedGoalWeeks(supabase: SupabaseClient, now: Date): Promise<void> {
  const currentWeekStart = getLockoutWeekStart("us");
  const previousWeekStart = new Date(currentWeekStart.getTime() - MS_PER_WEEK);
  const goalsByWeek = await resolveWeekGoals(supabase, currentWeekStart, previousWeekStart);

  const pending: { goal: SealedGoal; weekStart: Date; deadline: Date }[] = [];
  for (const weekStart of [previousWeekStart, currentWeekStart]) {
    for (const goal of goalsByWeek.get(weekKey(weekStart)) ?? []) {
      const deadline = resolveGoalDeadline(weekStart, goal.deadlineOffsetMinutes);
      if (deadline.getTime() <= now.getTime()) pending.push({ goal, weekStart, deadline });
    }
  }
  if (pending.length === 0) return;

  const weekKeys = Array.from(new Set(pending.map((p) => weekKey(p.weekStart))));
  const { data: existing } = await supabase
    .from("guild_goal_history")
    .select("goal_type, week_start")
    .in("week_start", weekKeys);

  const alreadyClosed = new Set(
    (existing ?? []).map((r) => `${r.goal_type}:${r.week_start}`)
  );
  const toClose = pending.filter((p) => !alreadyClosed.has(`${p.goal.goalType}:${weekKey(p.weekStart)}`));
  if (toClose.length === 0) return;

  await evaluateAndStore(supabase, toClose);
}

async function evaluateAndStore(
  supabase: SupabaseClient,
  toClose: { goal: SealedGoal; weekStart: Date; deadline: Date }[]
): Promise<GoalCloseSummary> {
  const [{ data: characters }, removedUserIds, friendUserIds, mainClassesByUser] = await Promise.all([
    supabase.from("characters").select("user_id, ilvl, class"),
    getRemovedUserIds(supabase),
    getFriendUserIds(supabase),
    getMainClassesByUser(supabase),
  ]);

  const charactersByUser = new Map<string, CharacterRow[]>();
  for (const row of (characters ?? []) as CharacterRow[]) {
    if (removedUserIds.has(row.user_id) || friendUserIds.has(row.user_id)) continue;
    const list = charactersByUser.get(row.user_id) ?? [];
    list.push(row);
    charactersByUser.set(row.user_id, list);
  }

  const rows = [];
  const porObjetivo: GoalCloseSummary["goals"] = [];
  for (const { goal, weekStart, deadline } of toClose) {
    let cumplieron = 0;
    const incumplieron: string[] = [];
    for (const [userId, ownCharacters] of charactersByUser) {
      const current = currentValueForRules(
        goal.goalType,
        ownCharacters,
        goal,
        mainClassesByUser.get(userId)
      );
      const met = current >= goal.target;
      if (met) cumplieron++;
      else incumplieron.push(userId);
      rows.push({
        user_id: userId,
        goal_type: goal.goalType,
        week_start: weekKey(weekStart),
        deadline_at: deadline.toISOString(),
        target: goal.target,
        min_ilvl: goal.minIlvl,
        only_mains: goal.onlyMains,
        top_n: goal.topN,
        current_value: current,
        met,
      });
    }
    porObjetivo.push({
      goalType: goal.goalType,
      target: goal.target,
      minIlvl: goal.minIlvl,
      onlyMains: goal.onlyMains,
      topN: goal.topN,
      met: cumplieron,
      total: charactersByUser.size,
      unmetUserIds: incumplieron,
    });
  }
  const resumen: GoalCloseSummary = {
    weekStart: toClose.length > 0 ? weekKey(toClose[0].weekStart) : "",
    evaluated: charactersByUser.size,
    goals: porObjetivo,
  };
  if (rows.length === 0) return resumen;

  const { error } = await supabase.from("guild_goal_history").upsert(rows, {
    onConflict: "user_id,goal_type,week_start",
    ignoreDuplicates: true,
  });
  if (error) console.error("Error guardando el historial de objetivos:", error.message);
  return resumen;
}


export async function isCurrentGoalWeekClosed(supabase: SupabaseClient): Promise<boolean> {
  const { data, error } = await supabase
    .from("guild_goal_history")
    .select("goal_type")
    .eq("week_start", weekKey(getLockoutWeekStart("us")))
    .limit(1);
  if (error) {
    console.error("Error consultando si la semana ya cerró:", error.message);
    return false;
  }
  return (data ?? []).length > 0;
}

export async function previewCurrentGoalWeekClose(
  supabase: SupabaseClient
): Promise<{ alreadyClosed: boolean; summary: GoalCloseSummary | null }> {
  const currentWeekStart = getLockoutWeekStart("us");
  if (await isCurrentGoalWeekClosed(supabase)) return { alreadyClosed: true, summary: null };

  const goals = await currentWeekSealedGoals(supabase, currentWeekStart);
  if (goals.length === 0) return { alreadyClosed: false, summary: null };

  const [{ data: characters }, removedUserIds, friendUserIds, mainClassesByUser] = await Promise.all([
    supabase.from("characters").select("user_id, ilvl, class"),
    getRemovedUserIds(supabase),
    getFriendUserIds(supabase),
    getMainClassesByUser(supabase),
  ]);

  const charactersByUser = new Map<string, CharacterRow[]>();
  for (const row of (characters ?? []) as CharacterRow[]) {
    if (removedUserIds.has(row.user_id) || friendUserIds.has(row.user_id)) continue;
    const list = charactersByUser.get(row.user_id) ?? [];
    list.push(row);
    charactersByUser.set(row.user_id, list);
  }

  return {
    alreadyClosed: false,
    summary: {
      weekStart: weekKey(currentWeekStart),
      evaluated: charactersByUser.size,
      goals: goals.map((goal) => {
        let met = 0;
        const unmetUserIds: string[] = [];
        for (const [userId, own] of charactersByUser) {
          const current = currentValueForRules(goal.goalType, own, goal, mainClassesByUser.get(userId));
          if (current >= goal.target) met++;
          else unmetUserIds.push(userId);
        }
        return {
          goalType: goal.goalType,
          target: goal.target,
          minIlvl: goal.minIlvl,
          onlyMains: goal.onlyMains,
          topN: goal.topN,
          met,
          total: charactersByUser.size,
          unmetUserIds,
        };
      }),
    },
  };
}

export async function closeCurrentGoalWeekNow(
  supabase: SupabaseClient
): Promise<{ closed: boolean; alreadyClosed: boolean; summary: GoalCloseSummary | null }> {
  const currentWeekStart = getLockoutWeekStart("us");
  if (await isCurrentGoalWeekClosed(supabase)) {
    return { closed: false, alreadyClosed: true, summary: null };
  }

  const goals = await currentWeekSealedGoals(supabase, currentWeekStart);
  if (goals.length === 0) return { closed: false, alreadyClosed: false, summary: null };

  const now = new Date();
  const summary = await evaluateAndStore(
    supabase,
    goals.map((goal) => ({ goal, weekStart: currentWeekStart, deadline: now }))
  );
  return { closed: true, alreadyClosed: false, summary };
}

async function currentWeekSealedGoals(
  supabase: SupabaseClient,
  currentWeekStart: Date
): Promise<SealedGoal[]> {
  const key = weekKey(currentWeekStart);
  const sealed = sealedGoalsForWeek(await getSealedGoalWeeks(supabase, [key]), key);
  if (sealed.length > 0) return sealed;

  const vigentes = await getGoalTargets(supabase);
  if (vigentes.length === 0) return [];
  await sealGoalWeek(supabase, currentWeekStart, vigentes);
  return goalsToSealed(vigentes);
}

export type { GoalCloseSummary, MemberGoalDebt };

interface HistoryRow {
  user_id: string;
  goal_type: GoalType;
  week_start: string;
  met: boolean;
  target: number;
  min_ilvl: number | null;
  only_mains: boolean | null;
  top_n: number | null;
}

async function fetchRecentHistory(
  supabase: SupabaseClient,
  userId?: string
): Promise<HistoryRow[]> {
  const since = weekKey(new Date(getLockoutWeekStart("us").getTime() - STREAK_WINDOW_WEEKS * MS_PER_WEEK));
  let query = supabase
    .from("guild_goal_history")
    .select("user_id, goal_type, week_start, met, target, min_ilvl, only_mains, top_n")
    .gte("week_start", since);
  if (userId) query = query.eq("user_id", userId);

  const { data, error } = await query;
  if (error) {
    console.error("Error leyendo guild_goal_history:", error.message);
    return [];
  }
  return (data ?? []) as HistoryRow[];
}

function toEntries(rows: HistoryRow[]): GoalHistoryEntry[] {
  return rows.map((r) => ({
    goalType: r.goal_type,
    weekStart: r.week_start,
    met: r.met,
    target: r.target,
    minIlvl: r.min_ilvl,
    onlyMains: r.only_mains ?? false,
    topN: r.top_n,
  }));
}

export async function getGoalDebtsByUser(supabase: SupabaseClient): Promise<MemberGoalDebt[]> {
  const rows = await fetchRecentHistory(supabase);

  const byUser = new Map<string, HistoryRow[]>();
  for (const row of rows) {
    const list = byUser.get(row.user_id) ?? [];
    list.push(row);
    byUser.set(row.user_id, list);
  }

  const debts: MemberGoalDebt[] = [];
  for (const [userId, userRows] of byUser) {
    const entries = toEntries(userRows);
    for (const goalType of ["characters", "avg_ilvl"] as GoalType[]) {
      const debt = computeGoalDebt(entries, goalType);
      if (debt) debts.push({ userId, ...debt });
    }
  }
  return debts;
}

export async function getGoalDebtsForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<Record<GoalType, MemberGoalDebt | null>> {
  const entries = toEntries(await fetchRecentHistory(supabase, userId));
  const build = (goalType: GoalType): MemberGoalDebt | null => {
    const debt = computeGoalDebt(entries, goalType);
    return debt ? { userId, ...debt } : null;
  };
  return { characters: build("characters"), avg_ilvl: build("avg_ilvl") };
}
