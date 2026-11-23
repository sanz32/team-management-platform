import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getCurrentLockoutWeek } from "@/lib/wow-reset";
import { refreshWclLockouts } from "@/lib/wcl-lockouts";
import { getCurrentRaidCatalog } from "@/lib/raid-catalog";

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

const WCL_STALE_AFTER_MS = 15 * 60 * 1000;

const REFRESH_STUCK_AFTER_MS = 2 * 60 * 1000;

async function setRefreshingSince(
  supabase: SupabaseClient,
  lockoutWeek: string,
  refreshingSince: Date | null
): Promise<void> {
  const { error } = await supabase
    .from("lockout_refresh_state")
    .upsert(
      { lockout_week: lockoutWeek, refreshing_since: refreshingSince?.toISOString() ?? null },
      { onConflict: "lockout_week" }
    );
  if (error) console.error("Error marcando refreshing_since:", error.message);
}

export interface LockoutFreshness {
  refreshedAt: string | null;
  refreshing: boolean;
}

export async function getLockoutFreshness(supabase: SupabaseClient): Promise<LockoutFreshness> {
  const lockoutWeek = getCurrentLockoutWeek("us");
  const { data, error } = await supabase
    .from("lockout_refresh_state")
    .select("refreshed_at, refreshing_since")
    .eq("lockout_week", lockoutWeek)
    .maybeSingle();

  if (error) console.error("Error leyendo lockout_refresh_state:", error.message);
  if (!data) return { refreshedAt: null, refreshing: false };

  const refreshing =
    !!data.refreshing_since && Date.now() - new Date(data.refreshing_since).getTime() < REFRESH_STUCK_AFTER_MS;

  return { refreshedAt: data.refreshed_at, refreshing };
}

export async function refreshWclLockoutsIfStale(supabase: SupabaseClient): Promise<void> {
  const lockoutWeek = getCurrentLockoutWeek("us");

  const { data, error } = await supabase
    .from("lockout_refresh_state")
    .select("refreshed_at, refreshing_since")
    .eq("lockout_week", lockoutWeek)
    .maybeSingle();

  if (error) console.error("Error leyendo lockout_refresh_state antes de refrescar WCL:", error.message);
  const isStale = !data || Date.now() - new Date(data.refreshed_at).getTime() > WCL_STALE_AFTER_MS;
  const alreadyRefreshing =
    !!data?.refreshing_since &&
    Date.now() - new Date(data.refreshing_since).getTime() < REFRESH_STUCK_AFTER_MS;

  if (!isStale || alreadyRefreshing) return;

  await setRefreshingSince(supabase, lockoutWeek, new Date());

  try {
    const { raids } = await getCurrentRaidCatalog(supabase);
    await refreshWclLockouts(
      supabase,
      raids.map((r) => r.key)
    );
  } catch (err) {
    console.error("Error en el refresh en background de lockouts (WCL):", err);
  } finally {
    await setRefreshingSince(supabase, lockoutWeek, null);
  }
}
