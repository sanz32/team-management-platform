import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { RoleRequest, ClassRequirement, RosterSelection } from "@/lib/roster-generator";
import { notifyRosterSelection } from "@/lib/notifications";
import { resolveValidMochilaAssignees, MochilaInput } from "@/lib/roster-mochila";
import { pruneExpiredRosters } from "@/lib/saved-rosters-expiry";
import { requiresVoidspireMythicMonkHeal, hasMonkHeal, VOIDSPIRE_MYTHIC_MONK_HEAL_ERROR } from "@/lib/roster-rules";

interface ContentConfig {
  raidKeys: string[];
  difficulty: "heroic" | "mythic";
  savedCount: number;
  unsavedCount: number;
}

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const supabase = createServerSupabaseClient();

  await pruneExpiredRosters(supabase);

  const { data, error } = await supabase
    .from("saved_rosters")
    .select("*, app_users(discord_username, nickname)")
    .order("scheduled_for", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rosters = (data ?? []).map((r) => ({
    id: r.id,
    scheduledFor: r.scheduled_for,
    roles: r.roles,
    targetAvgIlvl: r.target_avg_ilvl,
    content: r.content,
    classRequirements: r.class_requirements,
    selected: r.selected,
    averageIlvl: r.average_ilvl,
    mochilaRequestedCount: r.mochila_requested_count,
    mochilaAssignees: r.mochila_assignees ?? [],
    createdBy: r.app_users?.nickname ?? r.app_users?.discord_username ?? "Desconocido",
    createdAt: r.created_at,
  }));

  return NextResponse.json({ rosters });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const appRole = session.user.appRole;
  if (appRole !== "admin" && appRole !== "manager") {
    return NextResponse.json(
      { error: "Solo el líder o los managers pueden guardar un roster" },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const {
    scheduledFor,
    roles,
    targetAvgIlvl,
    content,
    classRequirements,
    selected,
    averageIlvl,
    mochila,
  } = body as {
    scheduledFor?: string;
    roles?: RoleRequest[];
    targetAvgIlvl?: number | null;
    content?: ContentConfig | null;
    classRequirements?: ClassRequirement[];
    selected?: RosterSelection[];
    averageIlvl?: number;
    mochila?: MochilaInput | null;
  };

  if (!scheduledFor || Number.isNaN(new Date(scheduledFor).getTime())) {
    return NextResponse.json({ error: "Fecha y hora inválidas" }, { status: 400 });
  }

  if (!roles?.length || !selected?.length) {
    return NextResponse.json({ error: "No hay roster generado para guardar" }, { status: 400 });
  }

  if (requiresVoidspireMythicMonkHeal(content) && !hasMonkHeal(selected)) {
    return NextResponse.json({ error: VOIDSPIRE_MYTHIC_MONK_HEAL_ERROR }, { status: 400 });
  }

  const discordId = session.user.discordId;
  const supabase = createServerSupabaseClient();

  const { data: appUser } = await supabase
    .from("app_users")
    .select("id")
    .eq("discord_id", discordId)
    .single();

  if (!appUser) {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  }

  const validMochilaAssignees = await resolveValidMochilaAssignees(supabase, mochila, selected);

  const { data, error } = await supabase
    .from("saved_rosters")
    .insert({
      scheduled_for: new Date(scheduledFor).toISOString(),
      roles,
      target_avg_ilvl: targetAvgIlvl ?? null,
      content: content ?? null,
      class_requirements: classRequirements ?? [],
      selected,
      average_ilvl: averageIlvl ?? 0,
      created_by: appUser.id,
      mochila_requested_count: mochila?.requestedCount ?? null,
      mochila_assignees: validMochilaAssignees.length > 0 ? validMochilaAssignees : null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (validMochilaAssignees.length > 0) {
    const { error: rpcError } = await supabase.rpc("increment_mochila_count", {
      p_user_ids: validMochilaAssignees.map((a) => a.userId),
    });
    if (rpcError) console.error("Error incrementando mochila_count:", rpcError);
  }

  await notifyRosterSelection({
    rosterId: data.id,
    scheduledFor: data.scheduled_for,
    content: data.content,
    userIds: (data.selected as RosterSelection[]).map((e) => e.candidate?.user_id),
  });

  return NextResponse.json({ roster: data });
}
