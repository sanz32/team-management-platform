import { createServerSupabaseClient } from "./supabase-server";
import { fetchItemDetails, fetchItemIcon } from "./blizzard";

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

export async function resolveWishlistItems(
  supabase: SupabaseClient,
  region: string,
  itemIds: number[],
  iconNameHints: Map<number, string> = new Map()
): Promise<void> {
  const uniqueIds = Array.from(new Set(itemIds));
  if (uniqueIds.length === 0) return;

  const { data: cached } = await supabase
    .from("wishlist_items")
    .select("item_id, item_class, item_subclass")
    .in("item_id", uniqueIds);

  const incompleteIds = new Set(
    (cached ?? []).filter((r) => r.item_class === "Armor" && !r.item_subclass).map((r) => r.item_id)
  );
  const cachedIds = new Set((cached ?? []).map((r) => r.item_id));
  const missingIds = uniqueIds.filter((id) => !cachedIds.has(id) || incompleteIds.has(id));
  if (missingIds.length === 0) return;

  const rows = await Promise.all(
    missingIds.map(async (itemId) => {
      const [details, iconUrl] = await Promise.all([
        fetchItemDetails(region, itemId),
        fetchItemIcon(region, itemId),
      ]);

      const iconHint = iconNameHints.get(itemId);
      const resolvedIcon =
        iconUrl ?? (iconHint ? `https://wow.zamimg.com/images/wow/icons/large/${iconHint}.jpg` : null);

      return {
        item_id: itemId,
        name: details?.name ?? null,
        icon_url: resolvedIcon,
        slot: details?.slot ?? null,
        item_class: details?.itemClass ?? null,
        item_subclass: details?.itemSubclass ?? null,
        quality: details?.quality ?? null,
        synced_at: new Date().toISOString(),
      };
    })
  );

  await supabase.from("wishlist_items").upsert(rows, { onConflict: "item_id" });
}
