import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { formatSwapRequest, resolveUserNames } from "@/lib/day-off-swaps";
import { notifySwapResponse } from "@/lib/notifications";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { id } = await params;
  const supabase = createServerSupabaseClient();

  const { data: appUser } = await supabase
    .from("app_users")
    .select("id")
    .eq("discord_id", session.user.discordId)
    .maybeSingle();

  if (!appUser) {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  }

  const { data: swapRequest, error: fetchError } = await supabase
    .from("day_off_swap_requests")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
  if (!swapRequest) return NextResponse.json({ error: "Solicitud no encontrada" }, { status: 404 });

  if (swapRequest.recipient_id !== appUser.id) {
    return NextResponse.json({ error: "Solo quien recibió la solicitud puede rechazarla" }, { status: 403 });
  }
  if (swapRequest.status !== "pending") {
    return NextResponse.json({ error: "Esta solicitud ya no está pendiente" }, { status: 409 });
  }

  const { data: updated, error: updateError } = await supabase
    .from("day_off_swap_requests")
    .update({ status: "rejected", responded_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  const nameById = await resolveUserNames(supabase, [swapRequest.requester_id, swapRequest.recipient_id]);
  const recipientName = nameById.get(swapRequest.recipient_id) ?? "El otro usuario";

  await notifySwapResponse({
    requesterId: swapRequest.requester_id,
    recipientName,
    accepted: false,
    requesterDate: swapRequest.requester_date,
    recipientDate: swapRequest.recipient_date,
  });

  return NextResponse.json({ request: formatSwapRequest(updated, nameById) });
}
