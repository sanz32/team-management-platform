import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { GROUP_SIZE } from "@/lib/mythic-plus-groups";
import { findUsersAlreadyInActiveGroup } from "@/lib/mythic-plus-group-membership";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  const appRole = session.user.appRole;
  if (appRole !== "admin" && appRole !== "manager") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const { name, archived, userIds } = body as { name?: string; archived?: boolean; userIds?: unknown };

  const supabase = createServerSupabaseClient();

  if (typeof name === "string" || typeof archived === "boolean") {
    const update: Record<string, unknown> = {};
    if (typeof name === "string") {
      const trimmed = name.trim();
      if (!trimmed) return NextResponse.json({ error: "El nombre no puede quedar vacío" }, { status: 400 });
      update.name = trimmed;
    }
    if (typeof archived === "boolean") {
      update.archived_at = archived ? new Date().toISOString() : null;
    }
    const { error } = await supabase.from("mythic_plus_groups").update(update).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (userIds !== undefined) {
    if (!Array.isArray(userIds) || userIds.length !== GROUP_SIZE || new Set(userIds).size !== GROUP_SIZE) {
      return NextResponse.json({ error: `Un grupo necesita exactamente ${GROUP_SIZE} integrantes distintos` }, { status: 400 });
    }

    try {
      const conflicts = await findUsersAlreadyInActiveGroup(supabase, userIds, id);
      if (conflicts.size > 0) {
        const names = [...new Set(conflicts.values())].join(", ");
        return NextResponse.json({ error: `Ya hay integrantes en otro grupo activo (${names})` }, { status: 400 });
      }
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : "Error desconocido" }, { status: 500 });
    }

    const { error: deleteError } = await supabase.from("mythic_plus_group_members").delete().eq("group_id", id);
    if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

    const { error: insertError } = await supabase
      .from("mythic_plus_group_members")
      .insert(userIds.map((userId) => ({ group_id: id, user_id: userId })));
    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  const appRole = session.user.appRole;
  if (appRole !== "admin" && appRole !== "manager") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { id } = await params;
  const supabase = createServerSupabaseClient();

  const { error } = await supabase.from("mythic_plus_groups").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
