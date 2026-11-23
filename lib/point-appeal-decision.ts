import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getCurrentAppUserId } from "@/lib/current-app-user";
import { describePoint, PointAppealError, resolveAppeal } from "@/lib/points";
import { notifyPointAppealDecision } from "@/lib/notifications";
import { announcePointAppealDecision } from "@/lib/discord-points";

export async function decideAppeal(
  params: Promise<{ id: string }>,
  approve: boolean
): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const appRole = session.user.appRole;
  if (appRole !== "admin" && appRole !== "manager") {
    return NextResponse.json(
      { error: "Solo el líder o los RL pueden resolver apelaciones" },
      { status: 403 }
    );
  }

  const { id } = await params;
  const supabase = createServerSupabaseClient();

  try {
    const reviewedBy = await getCurrentAppUserId(supabase, session.user);
    const resolved = await resolveAppeal(supabase, { appealId: id, approve, reviewedBy });

    const pointDescription = describePoint(resolved.point);
    const reviewerName = session.user.nickname || session.user.name || "Un RL";

    notifyPointAppealDecision(
      resolved.appeal.requesterId,
      approve,
      pointDescription,
      supabase
    ).catch(() => {});

    announcePointAppealDecision({
      memberDiscordId: resolved.ownerDiscordId,
      memberName: resolved.ownerName,
      approved: approve,
      reviewerName,
      pointDescription,
    }).catch(() => {});

    return NextResponse.json({ appeal: resolved.appeal, point: resolved.point });
  } catch (err) {
    if (err instanceof PointAppealError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : "No se pudo resolver la apelación";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
