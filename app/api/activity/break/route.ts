import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getActiveBreak, startBreak, cancelBreak } from "@/lib/activity-breaks";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const supabase = createServerSupabaseClient();
  const active = await getActiveBreak(supabase);
  return NextResponse.json({ active });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  const appRole = session?.user?.appRole;
  const secretHeader = req.headers.get("x-break-secret");
  const validSecret = !!process.env.BREAK_WATCHER_SECRET && secretHeader === process.env.BREAK_WATCHER_SECRET;

  const isManualAdmin = appRole === "admin" || appRole === "manager";
  if (!isManualAdmin && !validSecret) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { minutes } = body as { minutes?: number };

  if (!Number.isFinite(minutes) || (minutes as number) <= 0) {
    return NextResponse.json({ error: "Minutos inválidos" }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();

  let createdBy: string | null = null;
  if (isManualAdmin && session?.user?.discordId) {
    const { data: appUser } = await supabase
      .from("app_users")
      .select("id")
      .eq("discord_id", session.user.discordId)
      .maybeSingle();
    createdBy = appUser?.id ?? null;
  }

  try {
    const active = await startBreak(supabase, minutes as number, validSecret && !isManualAdmin ? "mrt-watcher" : "manual", createdBy);
    return NextResponse.json({ active });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error iniciando el break";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE() {
  const session = await auth();
  const appRole = session?.user?.appRole;
  if (appRole !== "admin" && appRole !== "manager") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const supabase = createServerSupabaseClient();
  try {
    await cancelBreak(supabase);
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error cancelando el break";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
