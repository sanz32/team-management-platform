import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { fetchRecentRuns, fetchRunDetails, type RaiderIoRunRosterMember } from "@/lib/mythic-plus-raiderio";
import { MIN_MATCH_TO_STORE, type MythicPlusRunRosterEntry } from "@/lib/mythic-plus-groups";
import { normalizeName, foldRealmForMatch } from "@/lib/wcl";

interface TrackedCharacter {
  characterId: string;
  userId: string;
  displayName: string;
  name: string;
  realmSlug: string;
  region: string;
}

function resolveRosterToTrackedUsers(
  roster: RaiderIoRunRosterMember[],
  trackedCharacters: TrackedCharacter[]
): Map<string, MythicPlusRunRosterEntry> {
  const byUser = new Map<string, MythicPlusRunRosterEntry>();
  for (const tracked of trackedCharacters) {
    if (byUser.has(tracked.userId)) continue;
    const foldedTrackedRealm = foldRealmForMatch(tracked.realmSlug);
    const found = roster.find((r) => {
      if (foldRealmForMatch(r.realmSlug) !== foldedTrackedRealm) return false;
      return r.characterName === tracked.name || normalizeName(r.characterName) === normalizeName(tracked.name);
    });
    if (found) {
      byUser.set(tracked.userId, {
        userId: tracked.userId,
        displayName: tracked.displayName,
        characterName: tracked.name,
        characterClass: found.className,
        realm: tracked.realmSlug,
        itemLevel: found.itemLevelEquipped,
      });
    }
  }
  return byUser;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const expected = process.env.CRON_SECRET;

  if (!expected) {
    return NextResponse.json({ error: "CRON_SECRET no está configurado en el servidor" }, { status: 500 });
  }
  if (authHeader !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const supabase = createServerSupabaseClient();

  const [{ data: groups, error: groupsError }, { data: members, error: membersError }] = await Promise.all([
    supabase.from("mythic_plus_groups").select("id").is("archived_at", null),
    supabase.from("mythic_plus_group_members").select("group_id, user_id"),
  ]);

  if (groupsError) return NextResponse.json({ error: groupsError.message }, { status: 500 });
  if (membersError) return NextResponse.json({ error: membersError.message }, { status: 500 });

  const activeGroupIds = new Set((groups ?? []).map((g) => g.id));
  const groupsMap = new Map<string, Set<string>>();
  const trackedUserIds = new Set<string>();

  for (const row of members ?? []) {
    if (!activeGroupIds.has(row.group_id)) continue;
    if (!groupsMap.has(row.group_id)) groupsMap.set(row.group_id, new Set());
    groupsMap.get(row.group_id)!.add(row.user_id);
    trackedUserIds.add(row.user_id);
  }

  if (trackedUserIds.size === 0) {
    return NextResponse.json({ charactersProcessed: 0, runsStored: 0, errors: [] });
  }

  const [{ data: characters, error: charactersError }, { data: users, error: usersError }] = await Promise.all([
    supabase
      .from("characters")
      .select("id, name, realm_slug, region, user_id")
      .in("user_id", [...trackedUserIds]),
    supabase.from("app_users").select("id, discord_username, nickname").in("id", [...trackedUserIds]),
  ]);
  if (charactersError) return NextResponse.json({ error: charactersError.message }, { status: 500 });
  if (usersError) return NextResponse.json({ error: usersError.message }, { status: 500 });

  const displayNameByUserId = new Map((users ?? []).map((u) => [u.id, u.nickname ?? u.discord_username]));

  const trackedCharacters: TrackedCharacter[] = (characters ?? []).map((c) => ({
    characterId: c.id,
    userId: c.user_id,
    displayName: displayNameByUserId.get(c.user_id) ?? "?",
    name: c.name,
    realmSlug: c.realm_slug,
    region: c.region,
  }));

  let processed = 0;
  let stored = 0;
  const errors: string[] = [];

  for (const character of trackedCharacters) {
    try {
      const { data: cursor } = await supabase
        .from("mythic_plus_raiderio_cursors")
        .select("last_run_id")
        .eq("character_id", character.characterId)
        .maybeSingle();

      const recentRuns = await fetchRecentRuns(character.region, character.realmSlug, character.name);
      const lastRunId = cursor?.last_run_id ?? null;
      const newRuns = recentRuns.filter((r) => lastRunId === null || r.keystoneRunId > lastRunId);

      for (const run of newRuns) {
        if (!run.seasonSlug) continue;
        const details = await fetchRunDetails(run.seasonSlug, run.keystoneRunId);
        if (!details) continue;

        const matchedByUser = resolveRosterToTrackedUsers(details.roster, trackedCharacters);

        for (const [groupId, memberUserIds] of groupsMap) {
          const matchedGroupEntries = [...matchedByUser.entries()]
            .filter(([userId]) => memberUserIds.has(userId))
            .map(([, entry]) => entry);
          if (matchedGroupEntries.length < MIN_MATCH_TO_STORE) continue;

          const { error: upsertError } = await supabase.from("mythic_plus_group_runs").upsert(
            {
              group_id: groupId,
              source: "raiderio",
              source_run_id: String(details.keystoneRunId),
              dungeon_name: details.dungeon,
              keystone_level: details.mythicLevel,
              keystone_upgrades: details.numChests,
              clear_time_ms: details.clearTimeMs,
              completed_at: details.completedAt,
              matched_count: matchedGroupEntries.length,
              roster: matchedGroupEntries,
              avg_ilvl: average(matchedGroupEntries.map((m) => m.itemLevel).filter((v): v is number => v !== null)),
            },
            { onConflict: "group_id,source,source_run_id" }
          );
          if (!upsertError) stored++;
        }
      }

      const maxRunIdSeen = recentRuns.reduce((max, r) => Math.max(max, r.keystoneRunId), lastRunId ?? 0);
      if (maxRunIdSeen > (lastRunId ?? 0)) {
        await supabase
          .from("mythic_plus_raiderio_cursors")
          .upsert({ character_id: character.characterId, last_run_id: maxRunIdSeen, last_checked_at: new Date().toISOString() });
      }

      processed++;
    } catch (err) {
      errors.push(`${character.name}-${character.realmSlug}: ${err instanceof Error ? err.message : "error desconocido"}`);
    }
  }

  return NextResponse.json({ charactersProcessed: processed, runsStored: stored, errors });
}
