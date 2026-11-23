import { createServerSupabaseClient } from "@/lib/supabase-server";

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

const PAGE_SIZE = 1000;

export interface DiscoveredCurrency {
  currencyId: number;
  name: string | null;
  currencyType: string | null;
  holders: number;
  tracked: boolean;
  iconUrl: string | null;
}

export async function getTrackedCurrencyIds(supabase: SupabaseClient): Promise<number[]> {
  const { data, error } = await supabase.from("tracked_currencies").select("currency_id");
  if (error) throw new Error(`Error leyendo tracked_currencies: ${error.message}`);
  return (data ?? []).map((r) => r.currency_id as number);
}

export async function getDiscoveredCurrencies(supabase: SupabaseClient): Promise<DiscoveredCurrency[]> {
  const rows: { currency_id: number; name: string | null; currency_type: string | null; quantity: number }[] = [];
  let from = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("character_currencies")
      .select("currency_id, name, currency_type, quantity")
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw new Error(`Error leyendo character_currencies: ${error.message}`);

    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  const byId = new Map<number, DiscoveredCurrency>();
  for (const row of rows) {
    const existing = byId.get(row.currency_id);
    if (existing) {
      if (!existing.name && row.name) existing.name = row.name;
      if (row.quantity > 0) existing.holders++;
      continue;
    }
    byId.set(row.currency_id, {
      currencyId: row.currency_id,
      name: row.name,
      currencyType: row.currency_type,
      holders: row.quantity > 0 ? 1 : 0,
      tracked: false,
      iconUrl: null,
    });
  }

  const [trackedIds, icons] = await Promise.all([
    getTrackedCurrencyIds(supabase),
    getCurrencyIcons(supabase),
  ]);
  const trackedSet = new Set(trackedIds);

  const list = Array.from(byId.values()).map((c) => ({
    ...c,
    tracked: trackedSet.has(c.currencyId),
    iconUrl: icons[c.currencyId] ?? null,
  }));

  return list.sort((a, b) => b.holders - a.holders || a.currencyId - b.currencyId);
}

export async function getCurrencyIcons(supabase: SupabaseClient): Promise<Record<number, string>> {
  const { data, error } = await supabase.from("currency_icons").select("currency_id, icon_url");
  if (error) throw new Error(`Error leyendo currency_icons: ${error.message}`);

  const map: Record<number, string> = {};
  for (const row of data ?? []) {
    if (row.icon_url) map[row.currency_id as number] = row.icon_url as string;
  }
  return map;
}

interface WowheadTooltip {
  name?: string;
  icon?: string;
}

export async function resolveCurrencyIcon(
  supabase: SupabaseClient,
  currencyId: number
): Promise<string | null> {
  const { data: cached } = await supabase
    .from("currency_icons")
    .select("icon_url")
    .eq("currency_id", currencyId)
    .maybeSingle();

  if (cached?.icon_url) return cached.icon_url as string;

  try {
    const res = await fetch(
      `https://nether.wowhead.com/tooltip/currency/${currencyId}?dataEnv=1&locale=0`,
      { headers: { Accept: "application/json" } }
    );
    if (!res.ok) return null;

    const data = (await res.json()) as WowheadTooltip;
    if (!data.icon) return null;

    const iconUrl = `https://wow.zamimg.com/images/wow/icons/large/${data.icon}.jpg`;

    const { error } = await supabase.from("currency_icons").upsert(
      {
        currency_id: currencyId,
        icon_name: data.icon,
        icon_url: iconUrl,
        name: data.name ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "currency_id" }
    );
    if (error) console.error(`Error cacheando ícono de moneda ${currencyId}:`, error.message);

    return iconUrl;
  } catch (err) {
    console.error(`No se pudo resolver el ícono de la moneda ${currencyId}:`, err);
    return null;
  }
}
