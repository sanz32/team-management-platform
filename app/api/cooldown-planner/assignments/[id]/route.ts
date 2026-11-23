import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";

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

  const patch: Record<string, unknown> = {};
  if (typeof body?.plannedTimestampMs === "number") patch.planned_timestamp_ms = body.plannedTimestampMs;
  if ("assignedCharacterId" in (body ?? {})) {
    patch.assigned_character_id = typeof body.assignedCharacterId === "string" ? body.assignedCharacterId : null;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nada para actualizar." }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("cooldown_plan_assignments")
    .update(patch)
    .eq("id", id)
    .select("plan_id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (data?.plan_id) {
    await supabase.from("cooldown_plans").update({ updated_at: new Date().toISOString() }).eq("id", data.plan_id);
  }
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
  const { error } = await supabase.from("cooldown_plan_assignments").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
