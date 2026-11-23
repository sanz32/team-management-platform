import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { CooldownAssignmentSource, CooldownPlanAssignment } from "@/lib/cooldown-planner/types";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  if (session.user.appRole !== "admin" && session.user.appRole !== "manager") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { id: planId } = await params;
  const body = await request.json().catch(() => null);
  const spellId: number = typeof body?.spellId === "number" ? body.spellId : NaN;
  const plannedTimestampMs: number = typeof body?.plannedTimestampMs === "number" ? body.plannedTimestampMs : NaN;
  const assignedCharacterId: string | null =
    typeof body?.assignedCharacterId === "string" ? body.assignedCharacterId : null;
  const referenceCastId: string | null = typeof body?.referenceCastId === "string" ? body.referenceCastId : null;
  const source: CooldownAssignmentSource = referenceCastId ? "imported_from_reference" : "manual";

  if (!Number.isFinite(spellId) || !Number.isFinite(plannedTimestampMs)) {
    return NextResponse.json({ error: "Falta spellId o plannedTimestampMs." }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("cooldown_plan_assignments")
    .insert({
      plan_id: planId,
      spell_id: spellId,
      assigned_character_id: assignedCharacterId,
      planned_timestamp_ms: plannedTimestampMs,
      source,
      reference_cast_id: referenceCastId,
    })
    .select("id, plan_id, spell_id, assigned_character_id, planned_timestamp_ms, source, reference_cast_id")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "No se pudo agregar la asignación." }, { status: 500 });
  }

  await supabase.from("cooldown_plans").update({ updated_at: new Date().toISOString() }).eq("id", planId);

  const assignment: CooldownPlanAssignment = {
    id: data.id,
    planId: data.plan_id,
    spellId: data.spell_id,
    assignedCharacterId: data.assigned_character_id,
    plannedTimestampMs: data.planned_timestamp_ms,
    source: data.source,
    referenceCastId: data.reference_cast_id,
  };
  return NextResponse.json({ assignment });
}
