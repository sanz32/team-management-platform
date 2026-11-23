import { createServerSupabaseClient } from "@/lib/supabase-server";

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

const TABLE = "boost_refresh_signal";

export const REFRESH_THROTTLE_MS = 30_000;

export const REFRESH_PENDING_TTL_MS = 90_000;

export interface RefreshSignal {
  requestedAt: string;
  syncedAt: string;
}

export async function readRefreshSignal(supabase: SupabaseClient): Promise<RefreshSignal | null> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("requested_at, synced_at")
    .maybeSingle();

  if (error || !data) return null;
  return { requestedAt: data.requested_at as string, syncedAt: data.synced_at as string };
}

export function isRefreshPending(signal: RefreshSignal | null, now: Date = new Date()): boolean {
  if (!signal) return false;
  const requested = new Date(signal.requestedAt).getTime();
  const synced = new Date(signal.syncedAt).getTime();
  if (!Number.isFinite(requested) || !Number.isFinite(synced)) return false;
  if (requested <= synced) return false;
  return now.getTime() - requested < REFRESH_PENDING_TTL_MS;
}

export function canRequestRefresh(signal: RefreshSignal | null, now: Date = new Date()): boolean {
  if (!signal) return true;
  const requested = new Date(signal.requestedAt).getTime();
  if (!Number.isFinite(requested)) return true;
  return now.getTime() - requested >= REFRESH_THROTTLE_MS;
}

export async function requestRefresh(
  supabase: SupabaseClient,
  now: Date = new Date()
): Promise<{ requested: boolean; pending: boolean }> {
  const signal = await readRefreshSignal(supabase);
  if (!canRequestRefresh(signal, now)) {
    return { requested: false, pending: isRefreshPending(signal, now) };
  }

  const { error } = await supabase
    .from(TABLE)
    .update({ requested_at: now.toISOString() })
    .eq("id", true);

  if (error) {
    console.error("No se pudo pedir un refresco de cupos:", error.message);
    return { requested: false, pending: isRefreshPending(signal, now) };
  }
  return { requested: true, pending: true };
}

export async function markRefreshSynced(supabase: SupabaseClient): Promise<void> {
  const { error } = await supabase
    .from(TABLE)
    .update({ synced_at: new Date().toISOString() })
    .eq("id", true);
  if (error) console.error("No se pudo marcar el refresco como atendido:", error.message);
}
