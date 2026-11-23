import { createServerSupabaseClient } from "@/lib/supabase-server";
import { deleteRosterAnnouncement } from "@/lib/discord-notify";

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

const ROSTER_EXPIRY_MS = 24 * 60 * 60 * 1000;

export async function pruneExpiredRosters(supabase: SupabaseClient): Promise<void> {
  const cutoff = new Date(Date.now() - ROSTER_EXPIRY_MS).toISOString();

  const { data: expired, error: selectError } = await supabase
    .from("saved_rosters")
    .select("id, discord_message_id")
    .lt("created_at", cutoff);

  if (selectError) {
    console.error("Error buscando rosters vencidos:", selectError);
    return;
  }
  if (!expired?.length) return;

  const { error: deleteError } = await supabase.from("saved_rosters").delete().lt("created_at", cutoff);
  if (deleteError) {
    console.error("Error borrando rosters vencidos:", deleteError);
    return;
  }

  for (const r of expired) {
    if (r.discord_message_id) await deleteRosterAnnouncement(r.discord_message_id);
  }
}
