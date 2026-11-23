import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  extractReportCode,
  getFightParticipants,
  matchActorsToCharacters,
  WclNotFoundError,
  WclRateLimitError,
  WclReauthRequiredError,
} from "@/lib/wcl";
import { getRemovedUserIds } from "@/lib/removed-members";
import { getFriendUserIds } from "@/lib/friend-members";

interface MatchedCharacter {
  id: string;
  name: string;
  realm_slug: string;
  class: string | null;
  active_spec: string | null;
}

interface CharacterWithOwner {
  id: string;
  name: string;
  realm_slug: string;
  class: string | null;
  active_spec: string | null;
  user_id: string;
  blizzard_character_id: number | null;
  app_users: { discord_username: string | null; nickname: string | null } | null;
}

interface MatchedMember {
  user_id: string;
  discord_username: string;
  characters: MatchedCharacter[];
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const appRole = session.user.appRole;
  if (appRole !== "admin" && appRole !== "manager") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { url, fightIds } = body as { url?: string; fightIds?: number[] };

  if (!url || typeof url !== "string") {
    return NextResponse.json({ error: "Falta el link del reporte" }, { status: 400 });
  }
  if (!Array.isArray(fightIds) || fightIds.length === 0) {
    return NextResponse.json({ error: "Elige al menos una pelea" }, { status: 400 });
  }

  const reportCode = extractReportCode(url);
  if (!reportCode) {
    return NextResponse.json(
      { error: "Ese link no parece un reporte válido de Warcraft Logs" },
      { status: 400 }
    );
  }

  const supabase = createServerSupabaseClient();

  let actors;
  try {
    actors = await getFightParticipants(supabase, reportCode, fightIds);
  } catch (err) {
    if (err instanceof WclNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    if (err instanceof WclRateLimitError) {
      return NextResponse.json({ error: err.message }, { status: 429 });
    }
    if (err instanceof WclReauthRequiredError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    const message = err instanceof Error ? err.message : "Error consultando Warcraft Logs";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const { data, error } = await supabase
    .from("characters")
    .select(
      "id, name, realm_slug, class, active_spec, user_id, blizzard_character_id, app_users(discord_username, nickname)"
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const [removedUserIds, friendUserIds] = await Promise.all([
    getRemovedUserIds(supabase),
    getFriendUserIds(supabase),
  ]);
  const characters = ((data ?? []) as unknown as CharacterWithOwner[]).filter(
    (c) => !removedUserIds.has(c.user_id) && !friendUserIds.has(c.user_id)
  );
  const { matchedIds, unknownActors, stats } = matchActorsToCharacters(actors, characters);
  console.log("[wcl/participants] matching:", JSON.stringify(stats));

  const byId = new Map(characters.map((c) => [c.id, c]));
  const membersById = new Map<string, MatchedMember>();

  for (const id of matchedIds) {
    const c = byId.get(id)!;
    const owner = c.app_users;
    const discordUsername = owner?.nickname ?? owner?.discord_username ?? "Desconocido";

    if (!membersById.has(c.user_id)) {
      membersById.set(c.user_id, { user_id: c.user_id, discord_username: discordUsername, characters: [] });
    }
    membersById.get(c.user_id)!.characters.push({
      id: c.id,
      name: c.name,
      realm_slug: c.realm_slug,
      class: c.class,
      active_spec: c.active_spec,
    });
  }

  const matched = Array.from(membersById.values()).sort((a, b) =>
    a.discord_username.localeCompare(b.discord_username)
  );

  return NextResponse.json({ matched, unknown: unknownActors });
}
