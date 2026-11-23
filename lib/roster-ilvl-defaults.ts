import { createServerSupabaseClient } from "@/lib/supabase-server";

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

export type RaidDifficulty = "heroic" | "mythic";

export const ROSTER_ILVL_DIFFICULTIES: RaidDifficulty[] = ["heroic", "mythic"];

export const DEFAULT_ROSTER_ILVL: Record<RaidDifficulty, number> = {
  heroic: 270,
  mythic: 285,
};

export async function getRosterIlvlDefaults(
  supabase: SupabaseClient
): Promise<Record<RaidDifficulty, number>> {
  const { data } = await supabase.from("roster_ilvl_defaults").select("difficulty, min_ilvl");
  const result = { ...DEFAULT_ROSTER_ILVL };
  for (const row of data ?? []) {
    result[row.difficulty as RaidDifficulty] = row.min_ilvl as number;
  }
  return result;
}
