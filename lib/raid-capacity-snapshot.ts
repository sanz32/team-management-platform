import { createServerSupabaseClient } from "@/lib/supabase-server";
import type { RaidCapacityEntry } from "@/lib/raid-capacity-compute";

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

export interface RaidCapacitySnapshot {
  entries: RaidCapacityEntry[];
  computedAt: string | null;
}

export async function getRaidCapacitySnapshot(supabase: SupabaseClient): Promise<RaidCapacitySnapshot> {
  const { data } = await supabase
    .from("raid_capacity_snapshot")
    .select("entries, computed_at")
    .eq("id", 1)
    .maybeSingle();

  if (!data) return { entries: [], computedAt: null };
  return {
    entries: (data.entries as RaidCapacityEntry[]) ?? [],
    computedAt: data.computed_at as string,
  };
}

export async function saveRaidCapacitySnapshot(
  supabase: SupabaseClient,
  entries: RaidCapacityEntry[],
  computedBy: string | null
): Promise<string | null> {
  const { error } = await supabase.from("raid_capacity_snapshot").upsert({
    id: 1,
    entries,
    computed_at: new Date().toISOString(),
    computed_by: computedBy,
  });
  return error?.message ?? null;
}
