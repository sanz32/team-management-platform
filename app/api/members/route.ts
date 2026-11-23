import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const appRole = session.user.appRole;
  if (appRole !== "admin" && appRole !== "manager" && appRole !== "guest") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("app_users")
    .select("id, discord_username, nickname, avatar_url, app_role, removed_at")
    .order("discord_username");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const members = (data ?? [])
    .filter((m) => !m.removed_at && m.app_role !== "friend")
    .map((m) => ({
      id: m.id,
      discord_username: m.nickname ?? m.discord_username,
      avatar_url: m.avatar_url,
    }));

  return NextResponse.json({ members });
}
