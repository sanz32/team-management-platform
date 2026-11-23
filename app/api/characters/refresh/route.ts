import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { refreshCharacters, RefreshScope } from "@/lib/refresh-characters";
import { getRemovedUserIds } from "@/lib/removed-members";
import { getFriendUserIds } from "@/lib/friend-members";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { characterIds, all, scope } = body as {
    characterIds?: string[];
    all?: boolean;
    scope?: RefreshScope;
  };

  if (scope && scope !== "lockouts" && scope !== "armory" && scope !== "all") {
    return NextResponse.json({ error: "scope inválido" }, { status: 400 });
  }

  const appRole = session.user.appRole;
  const discordId = session.user.discordId;

  const supabase = createServerSupabaseClient();

  const { data: appUser } = await supabase
    .from("app_users")
    .select("id")
    .eq("discord_id", discordId)
    .single();

  if (!appUser) {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  }

  let query = supabase.from("characters").select("*");

  if (all) {
    if (appRole !== "admin" && appRole !== "manager") {
      return NextResponse.json(
        { error: "No tienes permiso para refrescar todo el guild" },
        { status: 403 }
      );
    }
    if (characterIds?.length) {
      query = query.in("id", characterIds);
    }
  } else if (characterIds?.length) {
    query = query.in("id", characterIds).eq("user_id", appUser.id);
  } else {
    query = query.eq("user_id", appUser.id);
  }

  const [{ data: characters, error }, removedUserIdsForRefresh, friendUserIds] = await Promise.all([
    query,
    all ? getRemovedUserIds(supabase) : Promise.resolve(new Set<string>()),
    getFriendUserIds(supabase),
  ]);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const activeCharacters = (all
    ? (characters ?? []).filter((c) => !removedUserIdsForRefresh.has(c.user_id))
    : characters ?? []
  ).map((c) => ({ ...c, owner_is_friend: friendUserIds.has(c.user_id) }));

  const results = await refreshCharacters(supabase, activeCharacters, scope ?? "all");

  return NextResponse.json({ updated: results.length, results });
}
