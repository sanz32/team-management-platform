import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { formatSwapRequest, resolveDiscordIds, resolveUserNames } from "@/lib/day-off-swaps";
import { notifySwapDecision } from "@/lib/notifications";
import { announceSwapDecision } from "@/lib/discord-dayoff";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const appRole = session.user.appRole;
  if (appRole !== "admin" && appRole !== "manager") {
    return NextResponse.json(
      { error: "Solo el líder o los RL pueden resolver intercambios" },
      { status: 403 }
    );
  }

  const { id } = await params;
  const supabase = createServerSupabaseClient();

  const { data: reviewer } = await supabase
    .from("app_users")
    .select("id")
    .eq("discord_id", session.user.discordId)
    .maybeSingle();

  if (!reviewer) {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  }

  const { data: swapRequest, error: fetchError } = await supabase
    .from("day_off_swap_requests")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
  if (!swapRequest) return NextResponse.json({ error: "Solicitud no encontrada" }, { status: 404 });

  if (swapRequest.status !== "awaiting_rl") {
    return NextResponse.json(
      { error: "Este intercambio no está esperando aprobación" },
      { status: 409 }
    );
  }

  const now = new Date().toISOString();
  const { data: updated, error: updateError } = await supabase
    .from("day_off_swap_requests")
    .update({ status: "denied", reviewed_by: reviewer.id, reviewed_at: now })
    .eq("id", id)
    .select("*")
    .single();
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  const [nameById, discordIdById] = await Promise.all([
    resolveUserNames(supabase, [swapRequest.requester_id, swapRequest.recipient_id, reviewer.id]),
    resolveDiscordIds(supabase, [swapRequest.requester_id, swapRequest.recipient_id]),
  ]);
  const reviewerName = nameById.get(reviewer.id) ?? "Un RL";

  await notifySwapDecision({
    requesterId: swapRequest.requester_id,
    recipientId: swapRequest.recipient_id,
    reviewerName,
    approved: false,
    requesterDate: swapRequest.requester_date,
    recipientDate: swapRequest.recipient_date,
  });

  await announceSwapDecision(
    {
      requesterName: nameById.get(swapRequest.requester_id) ?? "Alguien",
      requesterDate: swapRequest.requester_date,
      requesterDiscordId: discordIdById.get(swapRequest.requester_id) ?? null,
      recipientName: nameById.get(swapRequest.recipient_id) ?? "El otro usuario",
      recipientDate: swapRequest.recipient_date,
      recipientDiscordId: discordIdById.get(swapRequest.recipient_id) ?? null,
    },
    false,
    reviewerName
  );

  return NextResponse.json({ request: formatSwapRequest(updated, nameById) });
}
