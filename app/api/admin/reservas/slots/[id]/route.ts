import { NextRequest, NextResponse } from "next/server";
import type { Session } from "next-auth";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { isBoostCategory, isWithinSchedulingWindow } from "@/lib/boost";
import { canManageBoostCatalog } from "@/lib/boost-links";

const COLUMNS =
  "id, scheduled_at, difficulty, label, capacity, booked_count, local_hold_count, is_active, created_at, boost_slot_offers(offer_id)";

function denied(session: Session | null): NextResponse | null {
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!canManageBoostCatalog(session.user.appRole)) {
    return NextResponse.json({ error: "Solo admin o manager pueden editar los horarios" }, { status: 403 });
  }
  return null;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const blocked = denied(session);
  if (blocked) return blocked;

  try {
    const { id } = await params;
    const body = (await req.json()) as Record<string, unknown>;
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (body.difficulty !== undefined) {
      if (!isBoostCategory(body.difficulty)) {
        return NextResponse.json({ error: "Dificultad inválida" }, { status: 400 });
      }
      patch.difficulty = body.difficulty;
    }
    if (typeof body.scheduled_at === "string") {
      const date = new Date(body.scheduled_at);
      if (Number.isNaN(date.getTime())) {
        return NextResponse.json({ error: "La fecha y hora no son válidas" }, { status: 400 });
      }
      if (!isWithinSchedulingWindow(date)) {
        return NextResponse.json(
          { error: "Solo se puede agendar en la semana en curso y la siguiente" },
          { status: 400 }
        );
      }
      patch.scheduled_at = date.toISOString();
    }
    if (body.capacity !== undefined) {
      const capacity = Number(body.capacity);
      if (!Number.isFinite(capacity) || capacity < 1) {
        return NextResponse.json({ error: "El cupo tiene que ser 1 o más" }, { status: 400 });
      }
      patch.capacity = Math.round(capacity);
    }
    if (body.booked_count !== undefined) {
      const bookedCount = Number(body.booked_count);
      if (!Number.isFinite(bookedCount) || bookedCount < 0) {
        return NextResponse.json({ error: "Los cupos vendidos tienen que ser 0 o más" }, { status: 400 });
      }
      patch.booked_count = Math.round(bookedCount);
    }
    if (body.label !== undefined) {
      patch.label = typeof body.label === "string" && body.label.trim() ? body.label.trim() : null;
    }
    if (typeof body.is_active === "boolean") patch.is_active = body.is_active;

    const supabase = createServerSupabaseClient();

    const nextCapacity =
      patch.capacity !== undefined ? (patch.capacity as number) : undefined;
    const nextBooked =
      patch.booked_count !== undefined ? (patch.booked_count as number) : undefined;

    if (nextCapacity !== undefined || nextBooked !== undefined) {
      const { data: current } = await supabase
        .from("boost_schedule_slots")
        .select("capacity, booked_count, local_hold_count")
        .eq("id", id)
        .maybeSingle();

      const finalCapacity = nextCapacity ?? current?.capacity ?? 0;
      const finalBooked = nextBooked ?? current?.booked_count ?? 0;
      const held = current?.local_hold_count ?? 0;
      if (finalBooked + held > finalCapacity) {
        return NextResponse.json(
          {
            error:
              held > 0
                ? `No entra: quedarían ${finalBooked + held} ocupados (${finalBooked} vendidos + ${held} apartados por reservas) sobre un cupo de ${finalCapacity}.`
                : "No puede haber más cupos vendidos que cupo total",
          },
          { status: 400 }
        );
      }
    }

    const { data, error } = await supabase
      .from("boost_schedule_slots")
      .update(patch)
      .eq("id", id)
      .select(COLUMNS)
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ slot: data });
  } catch (err) {
    console.error("Error editando el horario:", err);
    return NextResponse.json({ error: "No se pudo guardar el horario" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const blocked = denied(session);
  if (blocked) return blocked;

  const { id } = await params;
  const supabase = createServerSupabaseClient();

  const { count } = await supabase
    .from("boost_bookings")
    .select("id", { count: "exact", head: true })
    .eq("schedule_slot_id", id);

  if ((count ?? 0) > 0) {
    return NextResponse.json(
      {
        error: `Ese horario ya tiene ${count} reserva${count === 1 ? "" : "s"}. Desactívalo en vez de borrarlo para no perder el rastro.`,
      },
      { status: 409 }
    );
  }

  const { error } = await supabase.from("boost_schedule_slots").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
