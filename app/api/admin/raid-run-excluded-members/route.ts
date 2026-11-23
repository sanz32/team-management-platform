import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getCurrentAppUserId } from "@/lib/current-app-user";
import { excludeMember, getExcludedMembers, includeMember } from "@/lib/raid-run-excluded-members";

function requireManager(appRole: string | undefined) {
  return appRole === "admin" || appRole === "manager";
}

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  if (!requireManager(session.user.appRole)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const supabase = createServerSupabaseClient();
  const { members, error } = await getExcludedMembers(supabase);
  if (error) return NextResponse.json({ error }, { status: 500 });
  return NextResponse.json({ members });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  if (!requireManager(session.user.appRole)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { userId, note } = body as { userId?: string; note?: string | null };
  if (!userId) {
    return NextResponse.json({ error: "Falta el miembro a excluir" }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const createdBy = await getCurrentAppUserId(supabase, session.user);
  const upsertError = await excludeMember(supabase, userId, note?.trim() || null, createdBy);
  if (upsertError) return NextResponse.json({ error: upsertError }, { status: 500 });

  const { members, error } = await getExcludedMembers(supabase);
  if (error) return NextResponse.json({ error }, { status: 500 });
  return NextResponse.json({ members });
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  if (!requireManager(session.user.appRole)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { userId } = body as { userId?: string };
  if (!userId) {
    return NextResponse.json({ error: "Falta el miembro a incluir" }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const deleteError = await includeMember(supabase, userId);
  if (deleteError) return NextResponse.json({ error: deleteError }, { status: 500 });

  const { members, error } = await getExcludedMembers(supabase);
  if (error) return NextResponse.json({ error }, { status: 500 });
  return NextResponse.json({ members });
}
