import { createServerSupabaseClient } from "@/lib/supabase-server";

const PAGE_SIZE = 1000;

export interface CharacterVaultRow {
  character_id: string;
  slot_type: string;
  slot_index: number;
  threshold: number | null;
  progress: number | null;
  level: number | null;
  has_available_rewards: boolean;
  item_link: string | null;
  item_level: number | null;
}

const VAULT_COLUMNS =
  "character_id, slot_type, slot_index, threshold, progress, level, has_available_rewards, item_link, item_level";

export async function fetchAllCharacterVault(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  characterIds: string[]
): Promise<CharacterVaultRow[]> {
  if (characterIds.length === 0) return [];

  const rows: CharacterVaultRow[] = [];
  let from = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("character_vault")
      .select(VAULT_COLUMNS)
      .in("character_id", characterIds)
      .order("slot_index")
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw new Error(error.message);

    rows.push(...((data ?? []) as CharacterVaultRow[]));
    if (!data || data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
}
