import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getRemovedUserIds } from "@/lib/removed-members";
import { getFriendUserIds } from "@/lib/friend-members";

interface CharacterRow {
  user_id: string;
  app_users?: {
    discord_username: string | null;
    nickname: string | null;
    avatar_url: string | null;
    has_mochila: boolean | null;
  } | null;
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const appRole = session.user.appRole;
  if (appRole !== "admin" && appRole !== "manager" && appRole !== "guest") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const date = req.nextUrl.searchParams.get("date");
  const supabase = createServerSupabaseClient();

  const { data: characters, error } = await supabase
    .from("characters")
    .select("user_id, app_users(discord_username, nickname, avatar_url, has_mochila)")
    .not("role", "is", null)
    .not("ilvl", "is", null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let dayOffUserIds = new Set<string>();
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const { data: daysOff } = await supabase
      .from("availability")
      .select("user_id")
      .eq("available", false)
      .eq("date", date);
    dayOffUserIds = new Set((daysOff ?? []).map((r) => r.user_id as string));
  }

  const byUser = new Map<
    string,
    {
      user_id: string;
      discord_username: string;
      nickname: string | null;
      avatar_url: string | null;
      has_mochila: boolean;
      characterCount: number;
    }
  >();

  const [removedUserIds, friendUserIds] = await Promise.all([
    getRemovedUserIds(supabase),
    getFriendUserIds(supabase),
  ]);
  const rows = ((characters ?? []) as unknown as CharacterRow[]).filter(
    (c) => !removedUserIds.has(c.user_id) && !friendUserIds.has(c.user_id)
  );

  for (const c of rows) {
    const userId = c.user_id;
    const existing = byUser.get(userId);
    if (existing) {
      existing.characterCount++;
      continue;
    }
    byUser.set(userId, {
      user_id: userId,
      discord_username: c.app_users?.discord_username ?? "Desconocido",
      nickname: c.app_users?.nickname ?? null,
      avatar_url: c.app_users?.avatar_url ?? null,
      has_mochila: c.app_users?.has_mochila ?? false,
      characterCount: 1,
    });
  }

  const members = Array.from(byUser.values())
    .map((m) => ({ ...m, hasDayOff: dayOffUserIds.has(m.user_id) }))
    .sort((a, b) => (a.nickname ?? a.discord_username).localeCompare(b.nickname ?? b.discord_username));

  return NextResponse.json({ members });
}
