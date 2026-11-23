import { createServerSupabaseClient } from "@/lib/supabase-server";
import { slotPruneCutoff } from "@/lib/boost";

export async function pruneExpiredSlots(now: Date = new Date()): Promise<number> {
  try {
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from("boost_schedule_slots")
      .delete()
      .lt("scheduled_at", slotPruneCutoff(now).toISOString())
      .select("id");

    if (error) {
      console.error("No se pudieron podar las runs vencidas:", error.message);
      return 0;
    }
    return (data ?? []).length;
  } catch (err) {
    console.error("No se pudieron podar las runs vencidas:", err);
    return 0;
  }
}
