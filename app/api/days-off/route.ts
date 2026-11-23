import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { pruneExpiredDaysOff } from "@/lib/days-off";
import { dominantRolesByUser, getLockedAvailabilityIds } from "@/lib/day-off-swaps";
import { getCurrentAppUserId } from "@/lib/current-app-user";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const appRole = session.user.appRole;
  const canSeeAll = appRole === "admin" || appRole === "manager";
  const wantsAll = req.nextUrl.searchParams.get("all") === "true";
  const dateParam = req.nextUrl.searchParams.get("date");

  const supabase = createServerSupabaseClient();
  await pruneExpiredDaysOff(supabase);

  const appUserId = await getCurrentAppUserId(supabase, session.user);
  if (!appUserId) {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  }

  if (dateParam) {
    const { data: row, error } = await supabase
      .from("availability")
      .select("id")
      .eq("user_id", appUserId)
      .eq("available", false)
      .eq("date", dateParam)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ isDayOff: !!row });
  }

  if (wantsAll && canSeeAll) {
    const [
      { data: members, error: membersError },
      { data: rows, error: rowsError },
      { data: characterRoles, error: rolesError },
    ] = await Promise.all([
      supabase
        .from("app_users")
        .select("id, discord_username, nickname, app_role, removed_at")
        .order("discord_username"),
      supabase.from("availability").select("id, user_id, date").eq("available", false).order("date"),
      supabase.from("characters").select("user_id, role"),
    ]);

    if (membersError) return NextResponse.json({ error: membersError.message }, { status: 500 });
    if (rowsError) return NextResponse.json({ error: rowsError.message }, { status: 500 });
    if (rolesError) return NextResponse.json({ error: rolesError.message }, { status: 500 });

    const daysByUser = new Map<string, { id: string; date: string }[]>();
    for (const r of rows ?? []) {
      const list = daysByUser.get(r.user_id) ?? [];
      list.push({ id: r.id, date: r.date });
      daysByUser.set(r.user_id, list);
    }

    const activeMembers = (members ?? []).filter((m) => !m.removed_at && m.app_role !== "friend");
    const activeMemberIds = new Set(activeMembers.map((m) => m.id as string));

    const rolesByUser = dominantRolesByUser(
      ((characterRoles ?? []) as { user_id: string; role: string | null }[]).filter((c) =>
        activeMemberIds.has(c.user_id)
      ),
      activeMembers.map((m) => m.id as string)
    );

    const result = activeMembers
      .map((m) => ({
        user_id: m.id,
        discord_username: m.nickname ?? m.discord_username ?? "Desconocido",
        daysOff: daysByUser.get(m.id) ?? [],
        dominantRoles: rolesByUser.get(m.id) ?? [],
      }))
      .sort((a, b) => a.discord_username.localeCompare(b.discord_username));

    return NextResponse.json({ canSeeAll, members: result });
  }

  const [{ data: rows, error }, locked] = await Promise.all([
    supabase
      .from("availability")
      .select("id, date")
      .eq("user_id", appUserId)
      .eq("available", false)
      .order("date"),
    getLockedAvailabilityIds(supabase),
  ]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    canSeeAll,
    userId: appUserId,
    daysOff: (rows ?? []).map((r) => ({
      id: r.id,
      date: r.date,
      lockedBySwap: locked.has(r.id as string),
    })),
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const appRole = session.user.appRole;
  if (appRole !== "admin" && appRole !== "manager") {
    return NextResponse.json(
      { error: "Solo el líder o los managers pueden programar días libres" },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const { user_id, date } = body as { user_id?: string; date?: string };

  if (!user_id || !date || Number.isNaN(new Date(date).getTime())) {
    return NextResponse.json({ error: "Faltan usuario y/o fecha válidos" }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from("availability")
    .upsert({ user_id, date, available: false }, { onConflict: "user_id,date" })
    .select("id, date")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ dayOff: data });
}
