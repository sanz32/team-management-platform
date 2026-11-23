import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getCurrentAppUserId } from "@/lib/current-app-user";
import { canUseBoostLinks } from "@/lib/boost-links";
import { isBoostStatus } from "@/lib/boost";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const appRole = session.user.appRole;
    if (!canUseBoostLinks(appRole)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as { status?: unknown };
    if (!isBoostStatus(body.status)) {
      return NextResponse.json({ error: "Estado inválido" }, { status: 400 });
    }
    const nextStatus = body.status;

    const supabase = createServerSupabaseClient();
    const appUserId = await getCurrentAppUserId(supabase, session.user);

    const { data: booking, error: readError } = await supabase
      .from("boost_bookings")
      .select("id, status, raider_owner_id, schedule_slot_id")
      .eq("id", id)
      .maybeSingle();

    if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });
    if (!booking) return NextResponse.json({ error: "Esa reserva no existe" }, { status: 404 });

    const isOwner = !!appUserId && booking.raider_owner_id === appUserId;
    if (!isOwner && appRole !== "admin") {
      return NextResponse.json({ error: "Esa reserva no es tuya" }, { status: 403 });
    }

    if (booking.status === nextStatus) {
      return NextResponse.json({ ok: true, status: nextStatus });
    }

    if (booking.schedule_slot_id) {
      if (nextStatus === "cancelled") {
        await supabase.rpc("boost_release_slot", { p_slot_id: booking.schedule_slot_id });
      } else if (booking.status === "cancelled") {
        const { data: claimed } = await supabase.rpc("boost_claim_slot", {
          p_slot_id: booking.schedule_slot_id,
        });
        if (claimed !== true) {
          return NextResponse.json(
            { error: "Ese horario ya no tiene cupo libre. Muévelo a otro antes de reabrirlo." },
            { status: 409 }
          );
        }
      }
    }

    const { error } = await supabase
      .from("boost_bookings")
      .update({ status: nextStatus, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, status: nextStatus });
  } catch (err) {
    console.error("Error actualizando la reserva:", err);
    return NextResponse.json({ error: "No se pudo actualizar la reserva" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const appRole = session.user.appRole;
    if (!canUseBoostLinks(appRole)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const { id } = await params;
    const supabase = createServerSupabaseClient();
    const appUserId = await getCurrentAppUserId(supabase, session.user);

    const { data: booking, error: readError } = await supabase
      .from("boost_bookings")
      .select("id, status, raider_owner_id")
      .eq("id", id)
      .maybeSingle();

    if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });
    if (!booking) return NextResponse.json({ error: "Esa reserva no existe" }, { status: 404 });

    const isOwner = !!appUserId && booking.raider_owner_id === appUserId;
    if (!isOwner && appRole !== "admin") {
      return NextResponse.json({ error: "Esa reserva no es tuya" }, { status: 403 });
    }

    if (booking.status !== "cancelled") {
      return NextResponse.json(
        { error: "Solo se puede borrar una reserva cancelada" },
        { status: 409 }
      );
    }

    const { error } = await supabase.from("boost_bookings").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Error borrando la reserva:", err);
    return NextResponse.json({ error: "No se pudo borrar la reserva" }, { status: 500 });
  }
}
