import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getCurrentLockoutWeek } from "@/lib/wow-reset";

const PAGE_SIZE = 1000;

export interface BossKillRow {
  character_id: string;
  boss_key: string;
  lockout_week: string;
}

async function pruneOldBossKills(supabase: ReturnType<typeof createServerSupabaseClient>) {
  const currentUsWeek = getCurrentLockoutWeek("us");
  const { error } = await supabase.from("boss_kills").delete().lt("lockout_week", currentUsWeek);
  if (error) console.error("Error podando boss_kills viejos:", error.message);
}

export async function fetchAllBossKills(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  characterIds: string[],
  orFilter?: string
): Promise<BossKillRow[]> {
  if (characterIds.length === 0) return [];

  await pruneOldBossKills(supabase);

  const rows: BossKillRow[] = [];
  let from = 0;

  for (;;) {
    let query = supabase
      .from("boss_kills")
      .select("character_id, boss_key, lockout_week")
      .in("character_id", characterIds)
      .range(from, from + PAGE_SIZE - 1);

    if (orFilter) query = query.or(orFilter);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    rows.push(...((data ?? []) as BossKillRow[]));
    if (!data || data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
}
