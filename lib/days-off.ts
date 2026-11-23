import { createServerSupabaseClient } from "./supabase-server";
import { getGuildToday } from "./guild-day";

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

export function getCalendarWeekRange(reference: Date = new Date()): { start: string; end: string } {
  const day = reference.getUTCDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(
    Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), reference.getUTCDate() + diffToMonday)
  );
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return { start: monday.toISOString().slice(0, 10), end: sunday.toISOString().slice(0, 10) };
}

export async function pruneExpiredDaysOff(supabase: SupabaseClient): Promise<void> {
  const today = getGuildToday();
  const { error } = await supabase.rpc("prune_expired_days_off", { p_today: today });
  if (error) console.error("Error podando días libres vencidos:", error.message);
}
