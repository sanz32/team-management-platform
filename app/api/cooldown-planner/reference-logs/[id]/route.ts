import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { ReferenceLogTimeline, ReferencePhaseTransition } from "@/lib/cooldown-planner/types";
import { selectAllRows } from "@/lib/cooldown-planner/paginate";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { id } = await params;
  const supabase = createServerSupabaseClient();

  const { data: log, error: logError } = await supabase
    .from("reference_log_imports")
    .select(
      "id, wcl_report_code, wcl_fight_id, boss_id, difficulty, source_guild_name, imported_by, imported_at, pull_duration_ms, phase_transitions_ms"
    )
    .eq("id", id)
    .maybeSingle();
  if (logError) return NextResponse.json({ error: logError.message }, { status: 500 });
  if (!log) return NextResponse.json({ error: "No se encontró ese log de referencia." }, { status: 404 });

  let bossEvents, casts;
  try {
    bossEvents = await selectAllRows<{
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
        .eq("reference_log_id", id)
        .order("timestamp_ms")
        .range(from, to)
    );
    casts = await selectAllRows<{
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
        .eq("reference_log_id", id)
        .order("timestamp_ms")
        .range(from, to)
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error consultando el timeline del log.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const timeline: ReferenceLogTimeline = {
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
    bossEvents: bossEvents.map((e) => ({
      id: e.id,
      referenceLogId: e.reference_log_id,
      spellId: e.spell_id,
      spellName: e.spell_name,
      timestampMs: e.timestamp_ms,
      iconUrl: e.icon_url,
    })),
    casts: casts.map((c) => ({
      id: c.id,
      referenceLogId: c.reference_log_id,
      spellId: c.spell_id,
      casterName: c.caster_name,
      casterClass: c.caster_class,
      casterSpec: c.caster_spec,
      timestampMs: c.timestamp_ms,
    })),
  };

  return NextResponse.json(timeline);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  if (session.user.appRole !== "admin" && session.user.appRole !== "manager") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { id } = await params;
  const supabase = createServerSupabaseClient();

  await supabase
    .from("cooldown_plans")
    .update({ based_on_reference_log_id: null })
    .eq("based_on_reference_log_id", id);

  const { error } = await supabase.from("reference_log_imports").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
