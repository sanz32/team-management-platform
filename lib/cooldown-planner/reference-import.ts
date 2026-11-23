import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  getReportOverview,
  getFightCastEvents,
  getFightActorsWithSpecs,
  getReportAbilityNames,
  difficultyLabel,
} from "@/lib/wcl";
import { wclClassNameToDisplay } from "@/lib/wow-classes";
import { fetchSpellIcon, isPlayerOnlySpell } from "@/lib/blizzard-talents";
import { CooldownSpellSource, ReferenceLogTimeline, ReferencePhaseTransition } from "./types";
import { selectAllRows } from "./paginate";
import { mapWithConcurrency } from "./concurrency";
import { resolveOrCacheWclEncounterId } from "@/lib/raid-catalog";

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

export class FightNotFoundError extends Error {}
export class BossNotSyncedError extends Error {}

const INSERT_BATCH_SIZE = 500;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

const resolveBossId = resolveOrCacheWclEncounterId;

export async function importReferenceLog(
  supabase: SupabaseClient,
  importedByAppUserId: string | null,
  reportCode: string,
  fightId: number
): Promise<ReferenceLogTimeline> {
  const overview = await getReportOverview(supabase, reportCode);
  const fight = overview.fights.find((f) => f.id === fightId);
  if (!fight) throw new FightNotFoundError("No se encontró ese pull dentro del reporte.");

  const bossId = await resolveBossId(supabase, fight.encounterId, fight.bossName);
  if (!bossId) {
    throw new BossNotSyncedError(
      `No se encontró "${fight.bossName}" en ninguna temporada sincronizada (ver Configuración > Temporada).`
    );
  }

  const reportStart = overview.startTime ?? 0;
  const relativeStart = fight.startTime - reportStart;
  const relativeEnd = fight.endTime - reportStart;
  const phaseTransitions = fight.phaseTransitions.map((t) => ({
    ms: t.ms - fight.startTime,
    isIntermission: t.isIntermission,
  }));

  const { data: librarySpellsData, error: librarySpellsError } = await supabase
    .from("cooldown_spell_library")
    .select("spell_id")
    .eq("is_categorized", true)
    .eq("is_active", true);
  if (librarySpellsError) throw new Error(librarySpellsError.message);
  const librarySpellIds = new Set((librarySpellsData ?? []).map((s) => s.spell_id as number));

  const allLibrarySpellIds = new Set(
    (
      await selectAllRows<{ spell_id: number }>((from, to) =>
        supabase.from("cooldown_spell_library").select("spell_id").range(from, to)
      )
    ).map((r) => r.spell_id)
  );

  const [enemyEvents, friendlyEvents, actors, abilityNames] = await Promise.all([
    getFightCastEvents(supabase, reportCode, relativeStart, relativeEnd, "Enemies"),
    getFightCastEvents(supabase, reportCode, relativeStart, relativeEnd, "Friendlies"),
    getFightActorsWithSpecs(supabase, reportCode, fightId),
    getReportAbilityNames(supabase, reportCode),
  ]);

  const actorById = new Map(actors.map((a) => [a.id, a]));

  const environmentSpellIds = Array.from(
    new Set(enemyEvents.filter((e) => e.sourceId === -1).map((e) => e.abilityGameId))
  );
  const playerOnlyFlags = await mapWithConcurrency(environmentSpellIds, 10, (spellId) =>
    isPlayerOnlySpell(spellId).catch(() => false)
  );
  const playerOnlySpellIds = new Set(
    environmentSpellIds.filter((_, idx) => playerOnlyFlags[idx])
  );
  const realBossEvents = enemyEvents.filter((e) => !playerOnlySpellIds.has(e.abilityGameId));

  const newSpellCandidates = new Map<number, { name: string; className: string }>();
  for (const event of friendlyEvents) {
    if (allLibrarySpellIds.has(event.abilityGameId) || newSpellCandidates.has(event.abilityGameId)) continue;
    const actor = actorById.get(event.sourceId);
    if (!actor) continue;
    newSpellCandidates.set(event.abilityGameId, {
      name: abilityNames.get(event.abilityGameId) ?? `Spell ${event.abilityGameId}`,
      className: wclClassNameToDisplay(actor.class),
    });
  }

  if (newSpellCandidates.size > 0) {
    const region = process.env.BLIZZARD_REGION || "us";
    const entries = Array.from(newSpellCandidates.entries());
    const icons = await mapWithConcurrency(entries, 15, ([spellId]) =>
      fetchSpellIcon(region, spellId).catch(() => null)
    );
    const newSpellRows = entries.map(([spellId, info], idx) => ({
      spell_id: spellId,
      name: info.name,
      icon_url: icons[idx],
      class: info.className,
      is_active: true,
      is_categorized: false,
      source: "log_import" as CooldownSpellSource,
    }));
    const { error: newSpellsError } = await supabase.from("cooldown_spell_library").insert(newSpellRows);
    if (newSpellsError) throw new Error(newSpellsError.message);
  }

  const { data: log, error: logError } = await supabase
    .from("reference_log_imports")
    .insert({
      wcl_report_code: reportCode,
      wcl_fight_id: fightId,
      boss_id: bossId,
      difficulty: difficultyLabel(fight.difficulty),
      source_guild_name: overview.guildName,
      imported_by: importedByAppUserId,
      pull_duration_ms: relativeEnd - relativeStart,
      phase_transitions_ms: phaseTransitions,
    })
    .select(
      "id, wcl_report_code, wcl_fight_id, boss_id, difficulty, source_guild_name, imported_by, imported_at, pull_duration_ms, phase_transitions_ms"
    )
    .single();
  if (logError || !log) throw new Error(logError?.message ?? "No se pudo guardar el log de referencia.");

  const bossSpellIds = Array.from(new Set(realBossEvents.map((e) => e.abilityGameId)));
  const region = process.env.BLIZZARD_REGION || "us";
  const bossIcons = await mapWithConcurrency(bossSpellIds, 15, (spellId) =>
    fetchSpellIcon(region, spellId).catch(() => null)
  );
  const bossIconBySpellId = new Map(bossSpellIds.map((id, idx) => [id, bossIcons[idx]]));

  const bossEventRows = realBossEvents.map((e) => ({
    reference_log_id: log.id,
    spell_id: e.abilityGameId,
    spell_name: abilityNames.get(e.abilityGameId) ?? `Spell ${e.abilityGameId}`,
    timestamp_ms: e.timestampMs - relativeStart,
    icon_url: bossIconBySpellId.get(e.abilityGameId) ?? null,
  }));

  const castRows = friendlyEvents
    .filter((e) => librarySpellIds.has(e.abilityGameId))
    .map((e) => {
      const actor = actorById.get(e.sourceId);
      return actor
        ? {
            reference_log_id: log.id,
            spell_id: e.abilityGameId,
            caster_name: actor.name,
            caster_class: actor.class,
            caster_spec: actor.spec,
            timestamp_ms: e.timestampMs - relativeStart,
          }
        : null;
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  for (const batch of chunk(bossEventRows, INSERT_BATCH_SIZE)) {
    const { error } = await supabase.from("reference_boss_events").insert(batch);
    if (error) throw new Error(error.message);
  }
  for (const batch of chunk(castRows, INSERT_BATCH_SIZE)) {
    const { error } = await supabase.from("reference_cooldown_casts").insert(batch);
    if (error) throw new Error(error.message);
  }

  const insertedBossEvents = await selectAllRows<{
    id: string;
    reference_log_id: string;
    spell_id: number;
    spell_name: string;
    timestamp_ms: number;
    icon_url: string | null;
  }>((from, to) =>
    supabase
      .from("reference_boss_events")
      .select("id, reference_log_id, spell_id, spell_name, timestamp_ms, icon_url")
      .eq("reference_log_id", log.id)
      .order("timestamp_ms")
      .range(from, to)
  );
  const insertedCasts = await selectAllRows<{
    id: string;
    reference_log_id: string;
    spell_id: number;
    caster_name: string;
    caster_class: string | null;
    caster_spec: string | null;
    timestamp_ms: number;
  }>((from, to) =>
    supabase
      .from("reference_cooldown_casts")
      .select("id, reference_log_id, spell_id, caster_name, caster_class, caster_spec, timestamp_ms")
      .eq("reference_log_id", log.id)
      .order("timestamp_ms")
      .range(from, to)
  );

  return {
    log: {
      id: log.id,
      wclReportCode: log.wcl_report_code,
      wclFightId: log.wcl_fight_id,
      bossId: log.boss_id,
      difficulty: log.difficulty,
      sourceGuildName: log.source_guild_name,
      importedBy: log.imported_by,
      importedAt: log.imported_at,
      pullDurationMs: log.pull_duration_ms,
      phaseTransitions: (log.phase_transitions_ms as ReferencePhaseTransition[] | null) ?? [],
    },
    bossEvents: insertedBossEvents.map((e) => ({
      id: e.id,
      referenceLogId: e.reference_log_id,
      spellId: e.spell_id,
      spellName: e.spell_name,
      timestampMs: e.timestamp_ms,
      iconUrl: e.icon_url,
    })),
    casts: insertedCasts.map((c) => ({
      id: c.id,
      referenceLogId: c.reference_log_id,
      spellId: c.spell_id,
      casterName: c.caster_name,
      casterClass: c.caster_class,
      casterSpec: c.caster_spec,
      timestampMs: c.timestamp_ms,
    })),
  };
}
