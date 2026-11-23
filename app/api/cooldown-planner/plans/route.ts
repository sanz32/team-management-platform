import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { CooldownPlan } from "@/lib/cooldown-planner/types";

function mapPlan(row: {
  id: string;
  boss_id: string;
  name: string;
  created_by: string | null;
  based_on_reference_log_id: string | null;
  updated_at: string;
}): CooldownPlan {
  return {
    id: row.id,
    bossId: row.boss_id,
    name: row.name,
    createdBy: row.created_by,
    basedOnReferenceLogId: row.based_on_reference_log_id,
    updatedAt: row.updated_at,
  };
}

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
    .from("cooldown_plans")
    .select("id, boss_id, name, created_by, based_on_reference_log_id, updated_at")
    .eq("boss_id", bossId)
    .order("updated_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ plans: (data ?? []).map(mapPlan) });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  if (session.user.appRole !== "admin" && session.user.appRole !== "manager") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const bossId: string = typeof body?.bossId === "string" ? body.bossId : "";
  const name: string = typeof body?.name === "string" ? body.name.trim() : "";
  const basedOnReferenceLogId: string | null =
    typeof body?.basedOnReferenceLogId === "string" ? body.basedOnReferenceLogId : null;

  if (!bossId || !name) {
    return NextResponse.json({ error: "Falta bossId o el nombre del plan." }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const { data: appUser } = await supabase
    .from("app_users")
    .select("id")
    .eq("discord_id", session.user.discordId)
    .maybeSingle();

  const { data, error } = await supabase
    .from("cooldown_plans")
    .insert({
      boss_id: bossId,
      name,
      created_by: appUser?.id ?? null,
      based_on_reference_log_id: basedOnReferenceLogId,
    })
    .select("id, boss_id, name, created_by, based_on_reference_log_id, updated_at")
    .single();

  if (error || !data) return NextResponse.json({ error: error?.message ?? "No se pudo crear el plan." }, { status: 500 });
  return NextResponse.json({ plan: mapPlan(data) });
}
