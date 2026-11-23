import { createServerSupabaseClient } from "@/lib/supabase-server";
import { refreshCharacters } from "@/lib/refresh-characters";

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

const FRIEND_STALE_AFTER_MS = 15 * 60 * 1000;

export async function refreshFriendLockoutsIfStale(supabase: SupabaseClient, userId: string): Promise<void> {
  const { data: characters, error } = await supabase
    .from("characters")
    .select("id, name, realm_slug, region, mythic_plus_rating, last_updated")
    .eq("user_id", userId);

  if (error) {
    console.error("Error trayendo personajes propios de un friend:", error.message);
    return;
  }
  if (!characters || characters.length === 0) return;

  const oldestUpdate = Math.min(
    ...characters.map((c) => (c.last_updated ? new Date(c.last_updated).getTime() : 0))
  );
  if (Date.now() - oldestUpdate <= FRIEND_STALE_AFTER_MS) return;

  try {
    const friendCharacters = characters.map((c) => ({ ...c, owner_is_friend: true as const }));
    await refreshCharacters(supabase, friendCharacters, "lockouts");
  } catch (err) {
    console.error("Error en el refresh en background de lockouts de un friend (Blizzard):", err);
  }
}
