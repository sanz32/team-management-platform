import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getGoalTargets, GOAL_TYPES, GoalType } from "@/lib/guild-goals";
import { getLockoutWeekStart } from "@/lib/wow-reset";
import {
  goalDeadlineOffsetFromZoned,
  MAX_DEADLINE_DAY_INDEX,
  MINUTES_PER_WEEK,
} from "@/lib/goal-progress";
import { GUILD_TIMEZONE } from "@/lib/guild-day";
import { sealGoalWeek } from "@/lib/goal-weeks";
import { zonedParts } from "@/lib/timezone";

interface DeadlineInput {
  dayIndex: number;
  time: string;
}

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

function parseDeadline(deadline: unknown): { offset: number | null } | { error: string } {
  if (deadline == null) return { offset: null };

  const { dayIndex, time } = deadline as Partial<DeadlineInput>;
  if (!Number.isInteger(dayIndex) || (dayIndex as number) < 0 || (dayIndex as number) > MAX_DEADLINE_DAY_INDEX) {
    return { error: "El día de vencimiento tiene que estar dentro de la semana del reinicio." };
  }
  if (typeof time !== "string" || !TIME_PATTERN.test(time)) {
    return { error: "La hora de vencimiento tiene que ser una hora válida (por ejemplo 18:00)." };
  }

  const weekStart = getLockoutWeekStart("us");
  const offset = goalDeadlineOffsetFromZoned(weekStart, dayIndex as number, time);
  if (offset <= 0) {
    const resetTime = zonedParts(weekStart, GUILD_TIMEZONE).time;
    return {
      error: `Ese horario cae antes del reinicio semanal. Elige uno posterior al martes a las ${resetTime} (hora de Chile).`,
    };
  }
  if (offset >= MINUTES_PER_WEEK) {
    return { error: "Ese horario cae después del reinicio siguiente. Usa la semana completa." };
  }
  return { offset };
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
  const goals = await getGoalTargets(supabase);
  return NextResponse.json({ goals });
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

  const discordId = session.user.discordId;
  const body = await req.json().catch(() => ({}));
  const goals = (body as { goals?: unknown }).goals;

  if (!Array.isArray(goals) || goals.length === 0) {
    return NextResponse.json({ error: "No hay objetivos para guardar" }, { status: 400 });
  }

  for (const g of goals) {
    if (!GOAL_TYPES.includes(g?.goalType)) {
      return NextResponse.json({ error: `Tipo de objetivo inválido: ${g?.goalType}` }, { status: 400 });
    }
    if (g.target !== null && (!Number.isFinite(g.target) || g.target < 1)) {
      return NextResponse.json(
        { error: "La meta debe ser un número mayor a 0 (o vacía para sacarla del dashboard)" },
        { status: 400 }
      );
    }
    if (g.minIlvl != null && (!Number.isFinite(g.minIlvl) || g.minIlvl < 1)) {
      return NextResponse.json(
        { error: "El ilvl mínimo debe ser un número mayor a 0 (o vacío para no exigir ninguno)" },
        { status: 400 }
      );
    }
  }

  const supabase = createServerSupabaseClient();

  const { data: appUser } = await supabase
    .from("app_users")
    .select("id")
    .eq("discord_id", discordId)
    .single();

  if (!appUser) {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  }

  const typed = goals as {
    goalType: GoalType;
    target: number | null;
    minIlvl?: number | null;
    onlyMains?: boolean;
    deadline?: DeadlineInput | null;
  }[];
  const toDelete = typed.filter((g) => g.target === null).map((g) => g.goalType);

  const toUpsert = [];
  for (const g of typed.filter((g) => g.target !== null)) {
    const parsed = parseDeadline(g.deadline ?? null);
    if ("error" in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    toUpsert.push({
      goal_type: g.goalType,
      target: Math.round(g.target as number),
      min_ilvl: g.minIlvl != null ? Math.round(g.minIlvl) : null,
      only_mains: g.onlyMains ?? false,
      deadline_offset_minutes: parsed.offset,
      updated_by: appUser.id,
      updated_at: new Date().toISOString(),
    });
  }

  if (toDelete.length > 0) {
    const { error } = await supabase.from("guild_goals").delete().in("goal_type", toDelete);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (toUpsert.length > 0) {
    const { error } = await supabase.from("guild_goals").upsert(toUpsert, { onConflict: "goal_type" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const updatedGoals = await getGoalTargets(supabase);

  await sealGoalWeek(supabase, getLockoutWeekStart("us"), updatedGoals);

  return NextResponse.json({ goals: updatedGoals });
}
