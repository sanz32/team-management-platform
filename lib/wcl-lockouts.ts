import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  getGuildReportsInRange,
  getFightParticipants,
  matchActorsToCharacters,
  wclDifficultyToRaidDifficulty,
  GuildCharacterRef,
  MatchStats,
} from "@/lib/wcl";
import { mapWithConcurrency } from "@/lib/cooldown-planner/concurrency";
import { RaidKey, Difficulty, bossKey } from "@/lib/raids";
import { getCurrentLockoutWeek, getLockoutWeekStart } from "@/lib/wow-reset";
import { getCurrentRaidCatalog, RaidCatalog } from "@/lib/raid-catalog";
import { getRemovedUserIds } from "@/lib/removed-members";
import { getFriendUserIds } from "@/lib/friend-members";

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

function isAttemptBasedLockout(catalog: RaidCatalog, encounterId: number, difficulty: Difficulty): boolean {
  return catalog.attemptBasedLockouts.some(
    (c) => c.encounterId === encounterId && c.difficulty === difficulty
  );
}

export interface WclLockoutRefreshResult {
  reportsScanned: number;
  killsDetected: number;
  charactersUpdated: number;
}

export async function markLockoutDataRefreshed(
  supabase: SupabaseClient,
  lockoutWeek: string
): Promise<void> {
  const { error } = await supabase.from("lockout_refresh_state").upsert(
    { lockout_week: lockoutWeek, refreshed_at: new Date().toISOString(), refreshing_since: null },
    { onConflict: "lockout_week" }
  );
  if (error) throw new Error(`Error marcando lockouts como refrescados: ${error.message}`);
}

interface KillGroup {
  reportCode: string;
  raidKey: RaidKey;
  bossIndex: number;
  difficulty: Difficulty;
  fightIds: number[];
}

export async function refreshWclLockouts(
  supabase: SupabaseClient,
  raidKeys: RaidKey[]
): Promise<WclLockoutRefreshResult> {
  const raidKeySet = new Set(raidKeys);

  const guildIdRaw = process.env.WCL_GUILD_ID;
  if (!guildIdRaw) {
    throw new Error("WCL_GUILD_ID no está configurado en el servidor.");
  }
  const guildId = Number(guildIdRaw);

  const weekStart = getLockoutWeekStart("us");
  const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
  const lockoutWeek = getCurrentLockoutWeek("us");

  const catalog = await getCurrentRaidCatalog(supabase);

  const reports = await getGuildReportsInRange(supabase, guildId, weekStart.getTime(), weekEnd.getTime());

  const groups = new Map<string, KillGroup>();
  let killsDetected = 0;

  for (const report of reports) {
    for (const fight of report.fights) {
      const mapped = catalog.encounterToBoss[fight.encounterID];
      if (!mapped) continue;

      const difficulty = wclDifficultyToRaidDifficulty(fight.difficulty);
      if (!difficulty) continue;

      const isAttemptBasedCase = isAttemptBasedLockout(catalog, fight.encounterID, difficulty);

      if (!isAttemptBasedCase) {
        if (!raidKeySet.has(mapped.raidKey) || !fight.kill) continue;
      }

      killsDetected += 1;
      const groupKey = `${report.code}|${mapped.raidKey}|${mapped.bossIndex}|${difficulty}`;
      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          reportCode: report.code,
          raidKey: mapped.raidKey,
          bossIndex: mapped.bossIndex,
          difficulty,
          fightIds: [],
        });
      }
      groups.get(groupKey)!.fightIds.push(fight.id);
    }
  }

  if (groups.size === 0) {
    await markLockoutDataRefreshed(supabase, lockoutWeek);
    return { reportsScanned: reports.length, killsDetected: 0, charactersUpdated: 0 };
  }

  const { data: characterRows, error: charError } = await supabase
    .from("characters")
    .select("id, name, realm_slug, blizzard_character_id, user_id");
  if (charError) throw new Error(charError.message);
  const [removedUserIds, friendUserIds] = await Promise.all([
    getRemovedUserIds(supabase),
    getFriendUserIds(supabase),
  ]);
  const characters = ((characterRows ?? []) as (GuildCharacterRef & { user_id: string })[]).filter(
    (c) => !removedUserIds.has(c.user_id) && !friendUserIds.has(c.user_id)
  );

  const matchedCharacterIds = new Set<string>();
  const rows: { character_id: string; boss_key: string; lockout_week: string }[] = [];
  const totals: MatchStats = { byGameId: 0, byExactName: 0, byFoldedName: 0, unmatched: 0 };

  const groupResults = await mapWithConcurrency(
    Array.from(groups.values()),
    10,
    async (group) => {
      const actors = await getFightParticipants(supabase, group.reportCode, group.fightIds);
      return { group, ...matchActorsToCharacters(actors, characters) };
    }
  );

  for (const { group, matchedIds, stats } of groupResults) {
    totals.byGameId += stats.byGameId;
    totals.byExactName += stats.byExactName;
    totals.byFoldedName += stats.byFoldedName;
    totals.unmatched += stats.unmatched;
    const key = bossKey(group.raidKey, group.difficulty, group.bossIndex);

    for (const characterId of matchedIds) {
      matchedCharacterIds.add(characterId);
      rows.push({ character_id: characterId, boss_key: key, lockout_week: lockoutWeek });
    }
  }

  console.log("[wcl-lockouts] matching:", JSON.stringify(totals));

  if (rows.length > 0) {
    const { error } = await supabase
      .from("boss_kills")
      .upsert(rows, { onConflict: "character_id,boss_key,lockout_week", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  }

  await markLockoutDataRefreshed(supabase, lockoutWeek);
  return { reportsScanned: reports.length, killsDetected, charactersUpdated: matchedCharacterIds.size };
}
