import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export async function GET() {
  const session = await auth();
  if (!session?.user?.discordId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const supabase = createServerSupabaseClient();

  const { data: appUser, error: userError } = await supabase
    .from("app_users")
    .select("id")
    .eq("discord_id", session.user.discordId)
    .maybeSingle();

  if (userError) return NextResponse.json({ error: userError.message }, { status: 500 });
  if (!appUser) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });

  const { data: ownToken, error: ownError } = await supabase
    .from("sync_tokens")
    .select("created_at, last_used_at")
    .eq("user_id", appUser.id)
    .maybeSingle();

  if (ownError) return NextResponse.json({ error: ownError.message }, { status: 500 });

  const own = ownToken
    ? { linkedAt: ownToken.created_at, lastUsedAt: ownToken.last_used_at }
    : null;

  if (session.user.appRole !== "admin") {
    return NextResponse.json({ own, members: null });
  }

  const { data: tokens, error: tokensError } = await supabase
    .from("sync_tokens")
    .select("user_id, created_at, last_used_at, app_users!inner(nickname, discord_username)")
    .order("last_used_at", { ascending: false, nullsFirst: false });

  if (tokensError) return NextResponse.json({ error: tokensError.message }, { status: 500 });

  const members = (tokens ?? []).map((t) => {
    const user = Array.isArray(t.app_users) ? t.app_users[0] : t.app_users;
    return {
      userId: t.user_id as string,
      name: user?.nickname ?? user?.discord_username ?? "—",
      discordUsername: user?.discord_username ?? null,
      linkedAt: t.created_at as string | null,
      lastUsedAt: t.last_used_at as string | null,
      isSelf: t.user_id === appUser.id,
    };
  });

  return NextResponse.json({ own, members });
}
