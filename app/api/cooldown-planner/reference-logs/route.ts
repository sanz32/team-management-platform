import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { ReferenceLogImport, ReferencePhaseTransition } from "@/lib/cooldown-planner/types";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const bossId = searchParams.get("bossId");
  if (!bossId) {
    return NextResponse.json({ error: "Falta bossId." }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("reference_log_imports")
    .select(
      "id, wcl_report_code, wcl_fight_id, boss_id, difficulty, source_guild_name, imported_by, imported_at, pull_duration_ms, phase_transitions_ms"
    )
    .eq("boss_id", bossId)
    .order("imported_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const logs: ReferenceLogImport[] = (data ?? []).map((l) => ({
    id: l.id,
    wclReportCode: l.wcl_report_code,
    wclFightId: l.wcl_fight_id,
    bossId: l.boss_id,
    difficulty: l.difficulty,
    sourceGuildName: l.source_guild_name,
    importedBy: l.imported_by,
    importedAt: l.imported_at,
    pullDurationMs: l.pull_duration_ms,
    phaseTransitions: (l.phase_transitions_ms as ReferencePhaseTransition[] | null) ?? [],
  }));

  return NextResponse.json({ logs });
}
