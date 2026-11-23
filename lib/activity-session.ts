import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  ACTIVITY_ENTRY_TIME,
  ACTIVITY_EXIT_TIME,
  DAY_MS,
  guildDateKey,
  guildTimeAsUtc,
} from "@/lib/guild-day";

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

function currentSessionDate(now: Date): string | null {
  const todayKey = guildDateKey(now);
  const entryToday = guildTimeAsUtc(todayKey, ACTIVITY_ENTRY_TIME);
  const exitThisMorning = guildTimeAsUtc(todayKey, ACTIVITY_EXIT_TIME);
  const entryYesterday = new Date(entryToday.getTime() - DAY_MS);
  const exitTomorrowMorning = new Date(exitThisMorning.getTime() + DAY_MS);

  if (now >= entryToday && now <= exitTomorrowMorning) return todayKey;
  if (now >= entryYesterday && now <= exitThisMorning) {
    return guildDateKey(new Date(now.getTime() - DAY_MS));
  }
  return null;
}

export async function getEndedSessionDates(supabase: SupabaseClient): Promise<Set<string>> {
  const now = new Date();
  const todayKey = guildDateKey(now);
  const yesterdayKey = guildDateKey(new Date(now.getTime() - DAY_MS));

  const { data, error } = await supabase
    .from("guild_session_ends")
    .select("session_date")
    .in("session_date", [todayKey, yesterdayKey]);
  if (error) throw error;

  return new Set((data ?? []).map((r) => r.session_date as string));
}

export async function endCurrentSessionEarly(
  supabase: SupabaseClient,
  endedBy: string | null
): Promise<{ success: boolean; sessionDate?: string; error?: string }> {
  const sessionDate = currentSessionDate(new Date());
  if (!sessionDate) {
    return { success: false, error: "No hay ninguna jornada en curso para finalizar." };
  }

  const { error } = await supabase
    .from("guild_session_ends")
    .upsert({ session_date: sessionDate, ended_by: endedBy }, { onConflict: "session_date" });
  if (error) throw error;

  return { success: true, sessionDate };
}
