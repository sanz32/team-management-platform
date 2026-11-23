import { createServerSupabaseClient } from "@/lib/supabase-server";
import { NsrtBossNoteInput } from "@/lib/export/nsrt-note";

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

export class PlanNotFoundError extends Error {}

interface PlanRow {
  id: string;
  boss_id: string;
  based_on_reference_log_id: string | null;
  raid_bosses: { name: string; wcl_encounter_id: number | null } | null;
}

const NSRT_DIFFICULTY_LABELS: Record<string, string> = {
  "Mítico": "Mythic",
  "Heroico": "Heroic",
};

function phaseIndexAt(phases: { ms: number }[], timestampMs: number): number {
  let phase = 1;
  for (let i = 0; i < phases.length; i++) {
    if (phases[i].ms <= timestampMs) phase = i + 1;
    else break;
  }
  return phase;
}

export async function resolvePlanForNsrtExport(
  supabase: SupabaseClient,
  planId: string
): Promise<NsrtBossNoteInput> {
  const { data: plan } = await supabase
    .from("cooldown_plans")
    .select("id, boss_id, based_on_reference_log_id, raid_bosses(name, wcl_encounter_id)")
    .eq("id", planId)
    .maybeSingle<PlanRow>();
  if (!plan) throw new PlanNotFoundError("No se encontró el plan.");

  let pullDurationMs: number | null = null;
  let difficulty: string | null = null;
  let phases: { ms: number }[] = [];
  if (plan.based_on_reference_log_id) {
    const { data: log } = await supabase
      .from("reference_log_imports")
      .select("pull_duration_ms, difficulty, phase_transitions_ms")
      .eq("id", plan.based_on_reference_log_id)
      .maybeSingle();
    pullDurationMs = log?.pull_duration_ms ?? null;
    difficulty = log?.difficulty ? (NSRT_DIFFICULTY_LABELS[log.difficulty] ?? null) : null;
    phases = (log?.phase_transitions_ms as { ms: number }[] | null) ?? [];
  }

  const { data: assignments } = await supabase
    .from("cooldown_plan_assignments")
    .select("spell_id, planned_timestamp_ms, assigned_character_id")
    .eq("plan_id", planId)
    .not("assigned_character_id", "is", null);

  const rows = assignments ?? [];
  const spellIds = Array.from(new Set(rows.map((a) => a.spell_id as number)));
  const characterIds = Array.from(new Set(rows.map((a) => a.assigned_character_id as string)));

  const [spellsResult, charactersResult] = await Promise.all([
    spellIds.length > 0
      ? supabase.from("cooldown_spell_library").select("spell_id, name").in("spell_id", spellIds)
      : Promise.resolve({ data: [] as { spell_id: number; name: string }[] }),
    characterIds.length > 0
      ? supabase.from("characters").select("id, name").in("id", characterIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);

  const spellNameById = new Map((spellsResult.data ?? []).map((s) => [s.spell_id, s.name]));
  const characterNameById = new Map((charactersResult.data ?? []).map((c) => [c.id, c.name]));

  return {
    bossName: plan.raid_bosses?.name ?? "?",
    encounterId: plan.raid_bosses?.wcl_encounter_id ?? null,
    difficulty,
    pullDurationMs,
    assignments: rows.map((a) => ({
      spellId: a.spell_id as number,
      spellName: spellNameById.get(a.spell_id as number) ?? `Spell ${a.spell_id}`,
      timestampMs: a.planned_timestamp_ms as number,
      characterName: characterNameById.get(a.assigned_character_id as string) ?? "?",
      phase: phaseIndexAt(phases, a.planned_timestamp_ms as number),
    })),
  };
}
