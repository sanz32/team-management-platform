import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getCurrentAppUserId } from "@/lib/current-app-user";
import { getFriendUserIds } from "@/lib/friend-members";
import { matchesSearch } from "@/lib/search-fold";

const LIMIT = 8;

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return NextResponse.json({ members: [], characters: [] });
  }

  const appRole = session.user.appRole;
  const canSeeOthers =
    appRole === "admin" || appRole === "manager" || appRole === "guest" || appRole === "member";

  const supabase = createServerSupabaseClient();
  const ownUserId = await getCurrentAppUserId(supabase, session.user);

  const FETCH_CAP = 1000;

  if (!canSeeOthers && !ownUserId) {
    return NextResponse.json({ members: [], characters: [] });
  }

  const charactersQuery = supabase
    .from("characters")
    .select("id, name, realm_slug, class, ilvl, user_id");
  if (!canSeeOthers) charactersQuery.eq("user_id", ownUserId!);

  const [membersResult, charactersResult] = await Promise.all([
    canSeeOthers
      ? supabase
          .from("app_users")
          .select("id, discord_username, nickname, avatar_url, app_role, removed_at")
          .limit(FETCH_CAP)
      : Promise.resolve({ data: [], error: null }),
    charactersQuery.order("ilvl", { ascending: false, nullsFirst: false }).limit(FETCH_CAP),
  ]);

  if (membersResult.error || charactersResult.error) {
    const detail = membersResult.error?.message ?? charactersResult.error?.message;
    console.error("[search] fallo la consulta:", detail);
    return NextResponse.json({ error: "No se pudo buscar ahora mismo." }, { status: 500 });
  }

  const members = (membersResult.data ?? [])
    .filter((m) => !m.removed_at && m.app_role !== "friend")
    .filter((m) => matchesSearch(q, m.nickname, m.discord_username))
    .slice(0, LIMIT)
    .map((m) => ({
      id: m.id,
      name: m.nickname ?? m.discord_username,
      avatarUrl: m.avatar_url,
    }));

  let hiddenOwners = new Set<string>();
  if (canSeeOthers && appRole !== "admin") {
    hiddenOwners = await getFriendUserIds(supabase);
  }

  const characters = (charactersResult.data ?? [])
    .filter((c) => !c.user_id || !hiddenOwners.has(c.user_id))
    .filter((c) => matchesSearch(q, c.name, c.realm_slug))
    .slice(0, LIMIT)
    .map((c) => ({
      id: c.id,
      name: c.name,
      realm: c.realm_slug,
      class: c.class,
      ilvl: c.ilvl,
    }));

  return NextResponse.json({ members, characters });
}
