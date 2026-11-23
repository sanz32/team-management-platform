import { NextRequest, NextResponse, after } from "next/server";
import type { Session } from "next-auth";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { isBoostCategory, isWithinSchedulingWindow } from "@/lib/boost";
import { canManageBoostCatalog, canWipeBoostCatalog } from "@/lib/boost-links";
import { readRefreshSignal } from "@/lib/boost-refresh-signal";
import { pruneExpiredSlots } from "@/lib/boost-prune";
import { GUILD_TIMEZONE } from "@/lib/guild-day";
import { zonedParts } from "@/lib/timezone";

const COLUMNS =
  "id, scheduled_at, difficulty, label, capacity, booked_count, local_hold_count, is_active, created_at, boost_slot_offers(offer_id)";

function denied(session: Session | null): NextResponse | null {
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!canManageBoostCatalog(session.user.appRole)) {
    return NextResponse.json({ error: "Solo admin o manager pueden editar los horarios" }, { status: 403 });
  }
  return null;
}

export async function GET() {
  const session = await auth();
  const blocked = denied(session);
  if (blocked) return blocked;

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  after(() => pruneExpiredSlots());

  const supabase = createServerSupabaseClient();
  const [{ data, error }, signal] = await Promise.all([
    supabase.from("boost_schedule_slots").select(COLUMNS).gte("scheduled_at", since).order("scheduled_at"),
    readRefreshSignal(supabase),
  ]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    slots: data ?? [],
    syncedAt: signal?.syncedAt ?? null,
    guildHour: Number(zonedParts(new Date(), GUILD_TIMEZONE).time.slice(0, 2)),
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  const blocked = denied(session);
  if (blocked) return blocked;

  try {
    const body = (await req.json()) as Record<string, unknown>;

    const difficulty = body.difficulty;
    const scheduledAt = typeof body.scheduled_at === "string" ? body.scheduled_at : "";
    const capacity = Number(body.capacity);

    if (!isBoostCategory(difficulty)) {
      return NextResponse.json({ error: "Dificultad inválida" }, { status: 400 });
    }
    if (!scheduledAt || Number.isNaN(new Date(scheduledAt).getTime())) {
      return NextResponse.json({ error: "La fecha y hora no son válidas" }, { status: 400 });
    }
    if (!isWithinSchedulingWindow(new Date(scheduledAt))) {
      return NextResponse.json(
        { error: "Solo se puede agendar en la semana en curso y la siguiente" },
        { status: 400 }
      );
    }
    if (!Number.isFinite(capacity) || capacity < 1) {
      return NextResponse.json({ error: "El cupo tiene que ser 1 o más" }, { status: 400 });
    }

    const bookedCount = body.booked_count === undefined ? 0 : Number(body.booked_count);
    if (!Number.isFinite(bookedCount) || bookedCount < 0) {
      return NextResponse.json({ error: "Los cupos vendidos tienen que ser 0 o más" }, { status: 400 });
    }
    if (bookedCount > capacity) {
      return NextResponse.json(
        { error: "No puede haber más cupos vendidos que cupo total" },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from("boost_schedule_slots")
      .insert({
        scheduled_at: new Date(scheduledAt).toISOString(),
        difficulty,
        label: typeof body.label === "string" && body.label.trim() ? body.label.trim() : null,
        capacity: Math.round(capacity),
        booked_count: Math.round(bookedCount),
        is_active: body.is_active !== false,
      })
      .select(COLUMNS)
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ slot: data });
  } catch (err) {
    console.error("Error creando el horario:", err);
    return NextResponse.json({ error: "No se pudo crear el horario" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!canWipeBoostCatalog(session.user.appRole)) {
    return NextResponse.json(
      { error: "Solo un admin puede vaciar la agenda completa" },
      { status: 403 }
    );
  }

  try {
    const body = (await req.json().catch(() => ({}))) as { confirm?: unknown };
    if (body.confirm !== "TODOS") {
      return NextResponse.json({ error: "Falta la confirmación para vaciar la agenda" }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from("boost_schedule_slots")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000")
      .select("id");

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, deleted: (data ?? []).length });
  } catch (err) {
    console.error("Error vaciando la agenda de boosts:", err);
    return NextResponse.json({ error: "No se pudo vaciar la agenda" }, { status: 500 });
  }
}
