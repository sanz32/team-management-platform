import { createServerSupabaseClient } from "@/lib/supabase-server";

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

export interface RaidScheduleSlot {
  slotIndex: number;
  hour: number;
  minute: number;
}

export const RAID_SCHEDULE_TIMEZONE = "America/New_York";

export const DEFAULT_RAID_SCHEDULE: RaidScheduleSlot[] = [
  { slotIndex: 1, hour: 18, minute: 0 },
  { slotIndex: 2, hour: 20, minute: 0 },
  { slotIndex: 3, hour: 22, minute: 0 },
  { slotIndex: 4, hour: 0, minute: 0 },
];

export async function getRaidScheduleSlots(supabase: SupabaseClient): Promise<RaidScheduleSlot[]> {
  const { data } = await supabase
    .from("raid_schedule_slots")
    .select("slot_index, hour, minute");

  const bySlot = new Map((data ?? []).map((row) => [row.slot_index as number, row]));
  return DEFAULT_RAID_SCHEDULE.map((fallback) => {
    const row = bySlot.get(fallback.slotIndex);
    return row
      ? { slotIndex: fallback.slotIndex, hour: row.hour as number, minute: row.minute as number }
      : fallback;
  });
}
