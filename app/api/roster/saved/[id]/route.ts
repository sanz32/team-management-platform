import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { RosterSelection } from "@/lib/roster-generator";
import { deleteRosterAnnouncement } from "@/lib/discord-notify";
import { notifyRosterSelection } from "@/lib/notifications";
import {
  resolveValidMochilaAssignees,
  diffMochilaAssignees,
  MochilaInput,
  MochilaAssignee,
} from "@/lib/roster-mochila";
import { requiresVoidspireMythicMonkHeal, hasMonkHeal, VOIDSPIRE_MYTHIC_MONK_HEAL_ERROR } from "@/lib/roster-rules";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const appRole = session.user.appRole;
  if (appRole !== "admin" && appRole !== "manager") {
    return NextResponse.json(
      { error: "Solo el líder o los managers pueden editar un roster guardado" },
      { status: 403 }
    );
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const selected = body.selected as RosterSelection[] | undefined;
  const mochila = body.mochila as MochilaInput | null | undefined;

  if (!Array.isArray(selected)) {
    return NextResponse.json({ error: "Falta el arreglo de personajes" }, { status: 400 });
  }

  const averageIlvl =
    selected.length > 0
      ? selected.reduce((s, f) => s + (f.candidate?.ilvl ?? 0), 0) / selected.length
      : 0;

  const supabase = createServerSupabaseClient();

  const { data: before } = await supabase
    .from("saved_rosters")
    .select("selected, mochila_assignees, content")
    .eq("id", id)
    .maybeSingle();

  if (!before) {
    return NextResponse.json({ error: "Roster no encontrado" }, { status: 404 });
  }

  if (requiresVoidspireMythicMonkHeal(before.content) && !hasMonkHeal(selected)) {
    return NextResponse.json({ error: VOIDSPIRE_MYTHIC_MONK_HEAL_ERROR }, { status: 400 });
  }

  const oldUserIds = new Set(
    ((before?.selected ?? []) as RosterSelection[])
      .map((e) => e.candidate?.user_id)
      .filter(Boolean)
  );
  const oldMochilaAssignees = (before?.mochila_assignees ?? []) as MochilaAssignee[];

  const validMochilaAssignees = await resolveValidMochilaAssignees(supabase, mochila, selected);

  const { data, error } = await supabase
    .from("saved_rosters")
    .update({
      selected,
      average_ilvl: averageIlvl,
      mochila_requested_count: mochila?.requestedCount ?? null,
      mochila_assignees: validMochilaAssignees.length > 0 ? validMochilaAssignees : null,
    })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { added, removed } = diffMochilaAssignees(oldMochilaAssignees, validMochilaAssignees);
  if (added.length > 0) {
    const { error: incError } = await supabase.rpc("increment_mochila_count", {
      p_user_ids: added,
    });
    if (incError) console.error("Error incrementando mochila_count:", incError);
  }
  if (removed.length > 0) {
    const { error: decError } = await supabase.rpc("decrement_mochila_count", {
      p_user_ids: removed,
    });
    if (decError) console.error("Error decrementando mochila_count:", decError);
  }

  const newUserIds = ((data.selected ?? []) as RosterSelection[])
    .map((e) => e.candidate?.user_id)
    .filter((uid): uid is string => Boolean(uid) && !oldUserIds.has(uid));

  await notifyRosterSelection({
    rosterId: id,
    scheduledFor: data.scheduled_for,
    content: data.content,
    userIds: newUserIds,
  });

  return NextResponse.json({ roster: data });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const appRole = session.user.appRole;
  if (appRole !== "admin" && appRole !== "manager") {
    return NextResponse.json(
      { error: "Solo el líder o los managers pueden eliminar un roster guardado" },
      { status: 403 }
    );
  }

  const { id } = await params;
  const supabase = createServerSupabaseClient();

  const { data: existing } = await supabase
    .from("saved_rosters")
    .select("discord_message_id, mochila_assignees")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase.from("saved_rosters").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (existing?.discord_message_id) {
    await deleteRosterAnnouncement(existing.discord_message_id);
  }

  const mochilaAssignees = (existing?.mochila_assignees ?? []) as MochilaAssignee[];
  if (mochilaAssignees.length > 0) {
    const { error: decError } = await supabase.rpc("decrement_mochila_count", {
      p_user_ids: mochilaAssignees.map((a) => a.userId),
    });
    if (decError) console.error("Error decrementando mochila_count:", decError);
  }

  return NextResponse.json({ success: true });
}
