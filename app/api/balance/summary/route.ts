import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getBalanceSummary } from "@/lib/balance";
import { getCurrentAppUserId } from "@/lib/current-app-user";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const supabase = createServerSupabaseClient();

  const appUserId = await getCurrentAppUserId(supabase, session.user);
  if (!appUserId) {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  }

  const requestedUserId = req.nextUrl.searchParams.get("userId");
  const targetUserId = requestedUserId || appUserId;

  if (targetUserId !== appUserId) {
    const appRole = session.user.appRole;
    if (appRole !== "admin" && appRole !== "manager" && appRole !== "guest") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
  }

  const summary = await getBalanceSummary(supabase, targetUserId);
  return NextResponse.json(summary);
}
