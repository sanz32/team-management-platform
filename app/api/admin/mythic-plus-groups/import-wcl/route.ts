import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  getGuildDungeonReportsInRange,
  getFightParticipants,
  matchActorsToCharacters,
  type GuildCharacterRef,
} from "@/lib/wcl";
import { getLockoutWeekStart } from "@/lib/wow-reset";
import { MIN_MATCH_TO_STORE, type MythicPlusRunRosterEntry } from "@/lib/mythic-plus-groups";

export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  const appRole = session.user.appRole;
  if (appRole !== "admin" && appRole !== "manager") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const guildIdRaw = process.env.WCL_GUILD_ID;
  if (!guildIdRaw) {
    return NextResponse.json({ error: "WCL_GUILD_ID no está configurado en el servidor" }, { status: 500 });
  }
  const guildId = Number(guildIdRaw);

  const startTime = getLockoutWeekStart("us").getTime();
  const endTime = startTime + 7 * 24 * 60 * 60 * 1000;

  const supabase = createServerSupabaseClient();

  const [
    { data: groups, error: groupsError },
    { data: members, error: membersError },
    { data: characters, error: charactersError },
    { data: users, error: usersError },
  ] = await Promise.all([
    supabase.from("mythic_plus_groups").select("id").is("archived_at", null),
    supabase.from("mythic_plus_group_members").select("group_id, user_id"),
    supabase.from("characters").select("id, name, realm_slug, class, blizzard_character_id, user_id"),
    supabase.from("app_users").select("id, discord_username, nickname"),
  ]);

  if (groupsError) return NextResponse.json({ error: groupsError.message }, { status: 500 });
  if (membersError) return NextResponse.json({ error: membersError.message }, { status: 500 });
  if (charactersError) return NextResponse.json({ error: charactersError.message }, { status: 500 });
  if (usersError) return NextResponse.json({ error: usersError.message }, { status: 500 });

  const activeGroupIds = new Set((groups ?? []).map((g) => g.id));
  const groupMemberUserIds = new Map<string, Set<string>>();
  for (const m of members ?? []) {
    if (!activeGroupIds.has(m.group_id)) continue;
    if (!groupMemberUserIds.has(m.group_id)) groupMemberUserIds.set(m.group_id, new Set());
    groupMemberUserIds.get(m.group_id)!.add(m.user_id);
  }

  if (groupMemberUserIds.size === 0) {
    return NextResponse.json({ imported: 0, message: "No hay grupos activos para importar", weekStart: new Date(startTime).toISOString() });
  }

  const characterRefs: GuildCharacterRef[] = (characters ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    realm_slug: c.realm_slug,
    blizzard_character_id: c.blizzard_character_id,
  }));
  const characterById = new Map((characters ?? []).map((c) => [c.id, c]));
  const displayNameByUserId = new Map(
    (users ?? []).map((u) => [u.id, u.nickname ?? u.discord_username])
  );

  let reports;
  try {
    reports = await getGuildDungeonReportsInRange(supabase, guildId, startTime, endTime);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error consultando Warcraft Logs" }, { status: 500 });
  }

  const rowsToUpsert: {
    group_id: string;
    source: "wcl";
    source_run_id: string;
    dungeon_name: string | null;
    keystone_level: number | null;
    keystone_upgrades: number;
    clear_time_ms: number;
    completed_at: string;
    matched_count: number;
    roster: MythicPlusRunRosterEntry[];
    avg_ilvl: number | null;
  }[] = [];

  for (const report of reports) {
    for (const fight of report.fights) {
      if (fight.keystoneLevel === null) continue;

      let actors;
      try {
        actors = await getFightParticipants(supabase, report.code, [fight.id]);
      } catch {
        continue;
      }
      const { matchedIds } = matchActorsToCharacters(actors, characterRefs);

      const matchedUserIds = new Set<string>();
      for (const characterId of matchedIds) {
        const owner = characterById.get(characterId)?.user_id;
        if (owner) matchedUserIds.add(owner);
      }

      for (const [groupId, memberUserIds] of groupMemberUserIds) {
        const matchedGroupUsers = [...matchedUserIds].filter((id) => memberUserIds.has(id));
        if (matchedGroupUsers.length < MIN_MATCH_TO_STORE) continue;

        const roster: MythicPlusRunRosterEntry[] = matchedGroupUsers.map((userId) => {
          const characterId = [...matchedIds].find((cid) => characterById.get(cid)?.user_id === userId);
          const character = characterId ? characterById.get(characterId) : null;
          return {
            userId,
            displayName: displayNameByUserId.get(userId) ?? "?",
            characterName: character?.name ?? "?",
            characterClass: character?.class ?? null,
            realm: character?.realm_slug ?? "?",
            itemLevel: null,
          };
        });

        rowsToUpsert.push({
          group_id: groupId,
          source: "wcl",
          source_run_id: `${report.code}-${fight.id}`,
          dungeon_name: fight.name,
          keystone_level: fight.keystoneLevel,
          keystone_upgrades: fight.keystoneBonus ?? 0,
          clear_time_ms: fight.endTime - fight.startTime,
          completed_at: new Date(report.startTime + fight.endTime).toISOString(),
          matched_count: matchedGroupUsers.length,
          roster,
          avg_ilvl: fight.averageItemLevel,
        });
      }
    }
  }

  const touchedGroupIds = [...new Set(rowsToUpsert.map((r) => r.group_id))];

  if (touchedGroupIds.length > 0) {
    const { error: deleteError } = await supabase
      .from("mythic_plus_group_runs")
      .delete()
      .in("group_id", touchedGroupIds)
      .eq("source", "raiderio")
      .gte("completed_at", new Date(startTime).toISOString())
      .lte("completed_at", new Date(endTime).toISOString());
    if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  if (rowsToUpsert.length > 0) {
    const { error: upsertError } = await supabase
      .from("mythic_plus_group_runs")
      .upsert(rowsToUpsert, { onConflict: "group_id,source,source_run_id" });
    if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }

  return NextResponse.json({
    imported: rowsToUpsert.length,
    reportsScanned: reports.length,
    weekStart: new Date(startTime).toISOString(),
    weekEnd: new Date(endTime).toISOString(),
  });
}
