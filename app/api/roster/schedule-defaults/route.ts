import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getRaidScheduleSlots, RaidScheduleSlot } from "@/lib/raid-schedule-defaults";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const appRole = session.user.appRole;
  if (appRole !== "admin" && appRole !== "manager" && appRole !== "guest") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const supabase = createServerSupabaseClient();
  const slots = await getRaidScheduleSlots(supabase);
  return NextResponse.json({ slots });
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const appRole = session.user.appRole;
  if (appRole !== "admin" && appRole !== "manager") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const discordId = session.user.discordId;
  const body = await req.json().catch(() => ({}));
  const { slots } = body as { slots?: Partial<RaidScheduleSlot>[] };

  if (!Array.isArray(slots) || slots.length === 0) {
    return NextResponse.json({ error: "No hay horarios para guardar" }, { status: 400 });
  }

  for (const s of slots) {
    if (
      !Number.isInteger(s.slotIndex) ||
      (s.slotIndex as number) < 1 ||
      (s.slotIndex as number) > 4 ||
      !Number.isInteger(s.hour) ||
      (s.hour as number) < 0 ||
      (s.hour as number) > 23 ||
      !Number.isInteger(s.minute) ||
      (s.minute as number) < 0 ||
      (s.minute as number) > 59
    ) {
      return NextResponse.json(
        { error: "Cada horario necesita slotIndex (1-4), hour (0-23) y minute (0-59) válidos" },
        { status: 400 }
      );
    }
  }

  const supabase = createServerSupabaseClient();

  const { data: appUser } = await supabase
    .from("app_users")
    .select("id")
    .eq("discord_id", discordId)
    .single();

  if (!appUser) {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  }

  const toUpsert = slots.map((s) => ({
    slot_index: s.slotIndex,
    hour: s.hour,
    minute: s.minute,
    updated_by: appUser.id,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from("raid_schedule_slots")
    .upsert(toUpsert, { onConflict: "slot_index" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const updated = await getRaidScheduleSlots(supabase);
  return NextResponse.json({ slots: updated });
}
