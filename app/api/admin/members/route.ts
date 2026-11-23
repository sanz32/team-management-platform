import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";

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
    .from("app_users")
    .select("id, discord_username, nickname, avatar_url, app_role, binance_id, removed_at")
    .order("discord_username");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const all = (data ?? []).filter((m) => appRole === "admin" || m.app_role !== "friend");
  return NextResponse.json({
    members: all.filter((m) => !m.removed_at),
    removedMembers: all.filter((m) => m.removed_at),
  });
}
