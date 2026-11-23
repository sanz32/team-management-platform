import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { CooldownPlan, CooldownPlanAssignment } from "@/lib/cooldown-planner/types";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { id } = await params;
  const supabase = createServerSupabaseClient();

  const { data: planRow, error: planError } = await supabase
    .from("cooldown_plans")
    .select("id, boss_id, name, created_by, based_on_reference_log_id, updated_at")
    .eq("id", id)
    .maybeSingle();
  if (planError) return NextResponse.json({ error: planError.message }, { status: 500 });
  if (!planRow) return NextResponse.json({ error: "No se encontró el plan." }, { status: 404 });

  const { data: assignmentRows, error: assignmentsError } = await supabase
    .from("cooldown_plan_assignments")
    .select("id, plan_id, spell_id, assigned_character_id, planned_timestamp_ms, source, reference_cast_id")
    .eq("plan_id", id)
    .order("planned_timestamp_ms");
  if (assignmentsError) return NextResponse.json({ error: assignmentsError.message }, { status: 500 });

  const plan: CooldownPlan = {
    id: planRow.id,
    bossId: planRow.boss_id,
    name: planRow.name,
    createdBy: planRow.created_by,
    basedOnReferenceLogId: planRow.based_on_reference_log_id,
    updatedAt: planRow.updated_at,
  };
  const assignments: CooldownPlanAssignment[] = (assignmentRows ?? []).map((a) => ({
    id: a.id,
    planId: a.plan_id,
    spellId: a.spell_id,
    assignedCharacterId: a.assigned_character_id,
    plannedTimestampMs: a.planned_timestamp_ms,
    source: a.source,
    referenceCastId: a.reference_cast_id,
  }));

  return NextResponse.json({ plan, assignments });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  if (session.user.appRole !== "admin" && session.user.appRole !== "manager") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const name: string = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "Falta el nombre del plan." }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("cooldown_plans")
    .update({ name, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
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
  const { error } = await supabase.from("cooldown_plans").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
