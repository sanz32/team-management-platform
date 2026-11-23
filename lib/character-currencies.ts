import { createServerSupabaseClient } from "@/lib/supabase-server";

const PAGE_SIZE = 1000;

export interface CharacterCurrencyRow {
  character_id: string;
  currency_id: number;
  name: string | null;
  quantity: number;
  currency_type: string | null;
  total_earned: number | null;
  max_quantity: number | null;
  use_total_earned_for_max_qty: boolean | null;
  max_weekly_quantity: number | null;
  quantity_earned_this_week: number | null;
}

const CURRENCY_COLUMNS =
  "character_id, currency_id, name, quantity, currency_type, total_earned, max_quantity, use_total_earned_for_max_qty, max_weekly_quantity, quantity_earned_this_week";

export async function fetchAllCharacterCurrencies(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  characterIds: string[],
  currencyIds: number[]
): Promise<CharacterCurrencyRow[]> {
  if (characterIds.length === 0 || currencyIds.length === 0) return [];

  const rows: CharacterCurrencyRow[] = [];
  let from = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("character_currencies")
      .select(CURRENCY_COLUMNS)
      .in("character_id", characterIds)
      .in("currency_id", currencyIds)
      .order("currency_id")
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw new Error(error.message);

    rows.push(...((data ?? []) as CharacterCurrencyRow[]));
    if (!data || data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
}
