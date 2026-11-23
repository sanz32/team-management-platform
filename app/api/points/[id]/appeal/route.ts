import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getCurrentAppUserId } from "@/lib/current-app-user";
import { createAppeal, PointAppealError } from "@/lib/points";
import { announcePointAppealCreated } from "@/lib/discord-points";

function isBlockedRole(appRole: string | undefined): boolean {
  return appRole === "guest" || appRole === "friend";
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  if (isBlockedRole(session.user.appRole)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { id } = await params;
  const supabase = createServerSupabaseClient();

  try {
    const body = (await req.json().catch(() => null)) as { reason?: unknown } | null;
    const reason = typeof body?.reason === "string" ? body.reason : "";

    const appUserId = await getCurrentAppUserId(supabase, session.user);
    if (!appUserId) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }

    const appeal = await createAppeal(supabase, {
      pointId: id,
      requesterId: appUserId,
      reason,
    });

    announcePointAppealCreated().catch(() => {});

    return NextResponse.json({ appeal });
  } catch (err) {
    if (err instanceof PointAppealError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : "No se pudo enviar la apelación";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
