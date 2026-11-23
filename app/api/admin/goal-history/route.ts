import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getGoalDebtsByUser } from "@/lib/goal-history";
import { getMainClassesByUser } from "@/lib/main-classes";
import { settleGoalDebts, type MemberGoalDebt } from "@/lib/goal-progress";
import { GoalType } from "@/lib/guild-goals";
import { getLockoutWeekStart } from "@/lib/wow-reset";

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

function weekKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function isSafeToDelete(weekStart: string): boolean {
  const currentWeekStart = weekKey(getLockoutWeekStart("us"));
  const previousWeekStart = weekKey(new Date(getLockoutWeekStart("us").getTime() - MS_PER_WEEK));
  return weekStart !== currentWeekStart && weekStart !== previousWeekStart;
}

async function openGoalDebts(
  supabase: ReturnType<typeof createServerSupabaseClient>
): Promise<MemberGoalDebt[]> {
  const [debts, { data: characters }, mainClassesByUser] = await Promise.all([
    getGoalDebtsByUser(supabase),
    supabase.from("characters").select("user_id, ilvl, class"),
    getMainClassesByUser(supabase),
  ]);
  const charactersByUser = new Map<string, { ilvl: number | null; class: string | null }[]>();
  for (const row of (characters ?? []) as { user_id: string; ilvl: number | null; class: string | null }[]) {
    const list = charactersByUser.get(row.user_id) ?? [];
    list.push({ ilvl: row.ilvl, class: row.class });
    charactersByUser.set(row.user_id, list);
  }
  return settleGoalDebts(debts, charactersByUser, mainClassesByUser);
}

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  const appRole = session.user.appRole;
  if (appRole !== "admin" && appRole !== "manager") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("guild_goal_history")
    .select("week_start, goal_type, target, met, min_ilvl, only_mains, top_n")
    .order("week_start", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  interface Row {
    week_start: string;
    goal_type: GoalType;
    target: number;
    met: boolean;
    min_ilvl: number | null;
    only_mains: boolean | null;
    top_n: number | null;
  }

  interface WeekGoal {
    goalType: GoalType;
    target: number;
    minIlvl: number | null;
    onlyMains: boolean;
    topN: number | null;
    met: number;
    total: number;
  }

  const byWeek = new Map<string, Map<GoalType, WeekGoal>>();
  for (const row of (data ?? []) as Row[]) {
    const weekGoals = byWeek.get(row.week_start) ?? new Map<GoalType, WeekGoal>();
    byWeek.set(row.week_start, weekGoals);
    const g =
      weekGoals.get(row.goal_type) ??
      {
        goalType: row.goal_type,
        target: row.target,
        minIlvl: row.min_ilvl,
        onlyMains: row.only_mains ?? false,
        topN: row.top_n,
        met: 0,
        total: 0,
      };
    g.total += 1;
    if (row.met) g.met += 1;
    weekGoals.set(row.goal_type, g);
  }

  const weeks = Array.from(byWeek.entries())
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([weekStart, goals]) => ({
      weekStart,
      goals: Array.from(goals.values()),
      deletable: isSafeToDelete(weekStart),
    }));

  return NextResponse.json({ weeks });
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  const appRole = session.user.appRole;
  if (appRole !== "admin" && appRole !== "manager") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const weekStart = (body as { weekStart?: unknown }).weekStart;
  if (typeof weekStart !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
    return NextResponse.json({ error: "Semana inválida" }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("guild_goal_history").update({ met: true }).eq("week_start", weekStart);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const goalDebts = await openGoalDebts(supabase);
  return NextResponse.json({ goalDebts });
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  const appRole = session.user.appRole;
  if (appRole !== "admin" && appRole !== "manager") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const weekStart = (body as { weekStart?: unknown }).weekStart;
  if (typeof weekStart !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
    return NextResponse.json({ error: "Semana inválida" }, { status: 400 });
  }
  if (!isSafeToDelete(weekStart)) {
    return NextResponse.json(
      {
        error:
          'Esta semana es la actual o la anterior: borrarla se regeneraría sola, con los datos de hoy, la próxima vez que alguien entre a Personajes. Usa "Marcar como cumplida" en vez de eliminarla.',
      },
      { status: 400 }
    );
  }

  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("guild_goal_history").delete().eq("week_start", weekStart);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const goalDebts = await openGoalDebts(supabase);
  return NextResponse.json({ goalDebts });
}
