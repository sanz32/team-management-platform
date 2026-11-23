import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getLockoutWeekStart } from "@/lib/wow-reset";
import { EVIDENCE_BUCKET } from "@/lib/points";

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

const CLEANUP_TTL_MS = 60 * 60 * 1000;

const CLEANUP_STATE_KEY = "singleton";

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

const EVIDENCE_TTL_WEEKS = 10;

function weekKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function cleanupStaleEvidenceIfDue(supabase: SupabaseClient): Promise<void> {
  const { data: state, error: stateError } = await supabase
    .from("guild_points_evidence_cleanup_state")
    .select("checked_at")
    .eq("key", CLEANUP_STATE_KEY)
    .maybeSingle();

  if (stateError) {
    console.error("Error leyendo guild_points_evidence_cleanup_state:", stateError.message);
  }

  const now = Date.now();
  if (state?.checked_at && now - new Date(state.checked_at).getTime() < CLEANUP_TTL_MS) return;

  const { error: claimError } = await supabase
    .from("guild_points_evidence_cleanup_state")
    .upsert(
      { key: CLEANUP_STATE_KEY, checked_at: new Date(now).toISOString() },
      { onConflict: "key" }
    );
  if (claimError) {
    console.error("Error marcando guild_points_evidence_cleanup_state:", claimError.message);
  }

  try {
    await cleanupStaleEvidence(supabase, new Date(now));
  } catch (err) {
    console.error("Error limpiando capturas de Puntos:", err);
  }
}

async function cleanupStaleEvidence(supabase: SupabaseClient, now: Date): Promise<void> {
  void now;
  const cutoff = weekKey(
    new Date(getLockoutWeekStart("us").getTime() - EVIDENCE_TTL_WEEKS * MS_PER_WEEK)
  );

  const { data, error } = await supabase
    .from("guild_points")
    .select("id, evidence_path")
    .not("evidence_path", "is", null)
    .lt("week_start", cutoff);

  if (error) {
    console.error("Error buscando capturas vencidas:", error.message);
    return;
  }

  const stale = (data ?? []) as { id: string; evidence_path: string }[];
  if (stale.length === 0) return;

  const { error: removeError } = await supabase.storage
    .from(EVIDENCE_BUCKET)
    .remove(stale.map((r) => r.evidence_path));

  if (removeError && !/not.?found/i.test(removeError.message)) {
    console.error("Error borrando capturas vencidas del bucket:", removeError.message);
    return;
  }

  const { error: updateError } = await supabase
    .from("guild_points")
    .update({ evidence_path: null })
    .in(
      "id",
      stale.map((r) => r.id)
    );
  if (updateError) {
    console.error("Error limpiando evidence_path:", updateError.message);
  }
}
