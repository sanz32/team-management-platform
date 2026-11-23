import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  computeWeekEarnings,
  getEarningsWeekRange,
  getGuildWeekSnapshot,
  getMemberWeeklyHistory,
} from "@/lib/weekly-earnings";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const discordId = session.user.discordId;
  const appRole = session.user.appRole;
  const canManage = appRole === "admin" || appRole === "manager";
  const wantsAll = req.nextUrl.searchParams.get("all") === "true";

  const supabase = createServerSupabaseClient();

  const { data: appUser } = await supabase
    .from("app_users")
    .select("id")
    .eq("discord_id", discordId)
    .single();

  if (!appUser) {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  }

  if (wantsAll && canManage) {
    const weekStartParam = req.nextUrl.searchParams.get("weekStart");
    const { start, end } = weekStartParam
      ? getEarningsWeekRange(new Date(`${weekStartParam}T00:00:00Z`))
      : getEarningsWeekRange();

    const { data: members, error: membersError } = await supabase
      .from("app_users")
      .select("id, discord_username, nickname");

    if (membersError) return NextResponse.json({ error: membersError.message }, { status: 500 });

    const nameById = new Map(
      (members ?? []).map((m) => [m.id as string, (m.nickname ?? m.discord_username ?? "Desconocido") as string])
    );

    const closedRows = await getGuildWeekSnapshot(supabase, start);

    if (closedRows.length > 0) {
      const rows = closedRows
        .map((r) => ({ ...r, discord_username: nameById.get(r.user_id) ?? "Desconocido" }))
        .sort((a, b) => b.total_paid - a.total_paid);
      return NextResponse.json({ canManage, weekStart: start, weekEnd: end, closed: true, rows });
    }

    const live = await computeWeekEarnings(supabase, start, end);
    const rows = live
      .filter((r) => r.total_paid > 0)
      .map((r) => ({
        user_id: r.user_id,
        ib_paid: r.ib_paid,
        gold_paid_usd: r.gold_paid_usd,
        gold_paid_amount: r.gold_paid_amount,
        ob_paid: r.ob_paid,
        total_generated: r.total_generated,
        total_paid: r.total_paid,
        status: "pagado" as const,
        discord_username: nameById.get(r.user_id) ?? "Desconocido",
      }))
      .sort((a, b) => b.total_paid - a.total_paid);

    return NextResponse.json({ canManage, weekStart: start, weekEnd: end, closed: false, rows });
  }

  const history = await getMemberWeeklyHistory(supabase, appUser.id);
  return NextResponse.json({ canManage, history });
}
