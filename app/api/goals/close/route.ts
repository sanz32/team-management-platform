import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  closeCurrentGoalWeekNow,
  getGoalDebtsByUser,
  previewCurrentGoalWeekClose,
} from "@/lib/goal-history";
import { getMainClassesByUser } from "@/lib/main-classes";
import { settleGoalDebts, type MemberGoalDebt } from "@/lib/goal-progress";

async function requireManager() {
  const session = await auth();
  if (!session?.user) return { error: NextResponse.json({ error: "No autenticado" }, { status: 401 }) };
  const appRole = session.user.appRole;
  if (appRole !== "admin" && appRole !== "manager") {
    return { error: NextResponse.json({ error: "No autorizado" }, { status: 403 }) };
  }
  return { error: null };
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
  const { error } = await requireManager();
  if (error) return error;

  const supabase = createServerSupabaseClient();
  const preview = await previewCurrentGoalWeekClose(supabase);
  return NextResponse.json(preview);
}

export async function POST() {
  const { error } = await requireManager();
  if (error) return error;

  const supabase = createServerSupabaseClient();
  const result = await closeCurrentGoalWeekNow(supabase);

  if (result.alreadyClosed) {
    return NextResponse.json(
      { error: "Esta semana ya está cerrada. El objetivo siguiente arranca en el próximo reinicio." },
      { status: 409 }
    );
  }
  if (!result.closed) {
    return NextResponse.json(
      { error: "No hay ningún objetivo configurado para cerrar." },
      { status: 400 }
    );
  }

  return NextResponse.json({ summary: result.summary, goalDebts: await openGoalDebts(supabase) });
}
