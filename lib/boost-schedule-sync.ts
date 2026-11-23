import { createServerSupabaseClient } from "@/lib/supabase-server";
import { zonedTimeToUtc } from "@/lib/timezone";
import { slotKey, type ParsedSlot } from "@/lib/boost-import";

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

const SCHEDULE_TIMEZONE = "America/New_York";

export interface ExistingSlot {
  id: string;
  scheduled_at: string;
  label: string | null;
  capacity: number;
  booked_count: number;
  external_id: number | null;
  is_active: boolean;
}

export interface ApplyResult {
  creados: number;
  actualizados: number;
  sinCambios: number;
  desactivados: number;
  warnings: string[];
}

export function slotsToDeactivate(
  rows: ExistingSlot[],
  syncedDates: string[] | undefined,
  vistos: Set<string>,
  now: Date = new Date()
): ExistingSlot[] {
  if (!syncedDates || syncedDates.length === 0) return [];

  const rangos = syncedDates
    .map((date) => {
      const desde = zonedTimeToUtc(date, "00:00", SCHEDULE_TIMEZONE);
      const hasta = zonedTimeToUtc(date, "23:59", SCHEDULE_TIMEZONE);
      return { desde: desde.getTime(), hasta: hasta.getTime() + 59_999 };
    })
    .filter((r) => Number.isFinite(r.desde) && Number.isFinite(r.hasta));

  const ahora = now.getTime();
  const aDesactivar: ExistingSlot[] = [];

  for (const row of rows) {
    if (!row.is_active) continue;
    if (row.external_id === null) continue;
    if (vistos.has(row.id)) continue;
    const at = new Date(row.scheduled_at).getTime();
    if (Number.isNaN(at)) continue;
    if (!rangos.some((r) => at >= r.desde && at <= r.hasta)) continue;

    if (at <= ahora) continue;

    aDesactivar.push(row);
  }

  return aDesactivar;
}
export async function applyParsedSlots(
  supabase: SupabaseClient,
  slots: ParsedSlot[],
  syncedDates?: string[]
): Promise<ApplyResult> {
  const warnings: string[] = [];

  const { data: existing, error: readError } = await supabase
    .from("boost_schedule_slots")
    .select("id, scheduled_at, label, capacity, booked_count, external_id, is_active");

  if (readError) throw new Error(readError.message);

  const rows = (existing ?? []) as ExistingSlot[];
  const byExternalId = new Map<number, ExistingSlot>();
  const byKey = new Map<string, ExistingSlot>();
  for (const row of rows) {
    if (row.external_id !== null) byExternalId.set(row.external_id, row);
    byKey.set(slotKey({ scheduledAt: row.scheduled_at, label: row.label ?? "" }), row);
  }

  const nuevos: Record<string, unknown>[] = [];
  const cambios: { id: string; patch: Record<string, unknown> }[] = [];
  const vistos = new Set<string>();
  let sinCambios = 0;

  for (const slot of slots) {
    const found =
      (slot.externalId !== null ? byExternalId.get(slot.externalId) : undefined) ??
      byKey.get(slotKey(slot));

    if (!found) {
      nuevos.push({
        scheduled_at: slot.scheduledAt,
        difficulty: slot.difficulty,
        label: slot.label || null,
        capacity: slot.capacity,
        booked_count: slot.bookedCount,
        external_id: slot.externalId,
        is_active: true,
      });
      continue;
    }

    vistos.add(found.id);

    const patch: Record<string, unknown> = {};
    if (found.capacity !== slot.capacity) patch.capacity = slot.capacity;
    if (found.booked_count !== slot.bookedCount) patch.booked_count = slot.bookedCount;
    if (found.external_id === null && slot.externalId !== null) {
      patch.external_id = slot.externalId;
    }
    if (found.external_id !== null || slot.externalId !== null) {
      if (new Date(found.scheduled_at).getTime() !== new Date(slot.scheduledAt).getTime()) {
        patch.scheduled_at = slot.scheduledAt;
      }
      if ((found.label ?? "") !== slot.label) patch.label = slot.label || null;
    }
    if (!found.is_active) patch.is_active = true;

    if (Object.keys(patch).length === 0) {
      sinCambios += 1;
      continue;
    }
    patch.updated_at = new Date().toISOString();
    cambios.push({ id: found.id, patch });
  }

  const aDesactivar = slotsToDeactivate(rows, syncedDates, vistos);

  if (nuevos.length > 0) {
    const { error } = await supabase.from("boost_schedule_slots").insert(nuevos);
    if (error) throw new Error(error.message);
  }

  for (const { id, patch } of cambios) {
    const { error } = await supabase.from("boost_schedule_slots").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
  }

  if (aDesactivar.length > 0) {
    const { error } = await supabase
      .from("boost_schedule_slots")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .in(
        "id",
        aDesactivar.map((r) => r.id)
      );
    if (error) throw new Error(error.message);
    warnings.push(
      `${aDesactivar.length} run(s) ya no están en la plataforma y se ocultaron de la tienda.`
    );
  }

  if (nuevos.length > 0) {
    warnings.push(
      `${nuevos.length} run(s) quedaron SIN publicar: marca qué se vende en cada una para que aparezcan en la tienda.`
    );
  }

  return {
    creados: nuevos.length,
    actualizados: cambios.length,
    sinCambios,
    desactivados: aDesactivar.length,
    warnings,
  };
}
