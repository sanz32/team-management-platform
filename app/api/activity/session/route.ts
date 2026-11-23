import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getEndedSessionDates, endCurrentSessionEarly } from "@/lib/activity-session";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const supabase = createServerSupabaseClient();
  const endedDates = await getEndedSessionDates(supabase);
  return NextResponse.json({ endedDates: Array.from(endedDates) });
}

export async function POST() {
  const session = await auth();
  const appRole = session?.user?.appRole;
  if (appRole !== "admin" && appRole !== "manager") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const supabase = createServerSupabaseClient();

  let endedBy: string | null = null;
  if (session?.user?.discordId) {
    const { data: appUser } = await supabase
      .from("app_users")
      .select("id")
      .eq("discord_id", session.user.discordId)
      .maybeSingle();
    endedBy = appUser?.id ?? null;
  }

  try {
    const result = await endCurrentSessionEarly(supabase, endedBy);
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 409 });
    }
    return NextResponse.json({ success: true, sessionDate: result.sessionDate });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error finalizando la jornada";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
