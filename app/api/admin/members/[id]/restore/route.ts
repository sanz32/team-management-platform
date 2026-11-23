import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

  const { data: target, error: targetError } = await supabase
    .from("app_users")
    .select("id, app_role, removed_at")
    .eq("id", id)
    .maybeSingle();

  if (targetError) return NextResponse.json({ error: targetError.message }, { status: 500 });
  if (!target) return NextResponse.json({ error: "Miembro no encontrado" }, { status: 404 });

  if (appRole !== "admin" && target.app_role === "admin") {
    return NextResponse.json({ error: "Solo un admin puede restaurar a otro admin" }, { status: 403 });
  }

  if (!target.removed_at) {
    return NextResponse.json({ error: "Este miembro no está eliminado" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("app_users")
    .update({ removed_at: null, removed_by: null })
    .eq("id", id)
    .select("id, discord_username, nickname, avatar_url, app_role, removed_at")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ member: data });
}
