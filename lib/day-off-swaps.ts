import { createServerSupabaseClient } from "@/lib/supabase-server";
import { fetchAllBossKills } from "@/lib/boss-kills";
import { getCurrentLockoutWeek } from "@/lib/wow-reset";
import { getGuildToday } from "@/lib/guild-day";
import { Difficulty } from "@/lib/raids";
import { getCurrentRaidCatalog } from "@/lib/raid-catalog";

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

export type SwapStatus =
  | "pending"
  | "awaiting_rl"
  | "accepted"
  | "rejected"
  | "denied"
  | "cancelled"
  | "expired";

export const OPEN_SWAP_STATUSES: SwapStatus[] = ["pending", "awaiting_rl"];

export interface SwapRequestDTO {
  id: string;
  status: SwapStatus;
  message: string | null;
  requesterId: string;
  requesterName: string;
  requesterDate: string;
  recipientId: string;
  recipientName: string;
  recipientDate: string;
  createdAt: string;
  respondedAt: string | null;
  reviewedAt: string | null;
  reviewedByName: string | null;
}

interface RawSwapRequestRow {
  id: string;
  status: string;
  message: string | null;
  requester_id: string;
  recipient_id: string;
  requester_date: string;
  recipient_date: string;
  created_at: string;
  responded_at: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
}

export function formatSwapRequest(row: RawSwapRequestRow, nameById: Map<string, string>): SwapRequestDTO {
  return {
    id: row.id,
    status: row.status as SwapStatus,
    message: row.message,
    requesterId: row.requester_id,
    requesterName: nameById.get(row.requester_id) ?? "Desconocido",
    requesterDate: row.requester_date,
    recipientId: row.recipient_id,
    recipientName: nameById.get(row.recipient_id) ?? "Desconocido",
    recipientDate: row.recipient_date,
    createdAt: row.created_at,
    respondedAt: row.responded_at,
    reviewedAt: row.reviewed_at ?? null,
    reviewedByName: row.reviewed_by ? (nameById.get(row.reviewed_by) ?? null) : null,
  };
}

export async function resolveUserNames(
  supabase: SupabaseClient,
  userIds: string[]
): Promise<Map<string, string>> {
  const uniqueIds = Array.from(new Set(userIds));
  if (uniqueIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from("app_users")
    .select("id, discord_username, nickname")
    .in("id", uniqueIds);
  if (error) throw new Error(error.message);

  return new Map(
    (data ?? []).map((u) => [u.id as string, (u.nickname ?? u.discord_username ?? "Desconocido") as string])
  );
}

export async function resolveDiscordIds(
  supabase: SupabaseClient,
  userIds: string[]
): Promise<Map<string, string>> {
  const uniqueIds = Array.from(new Set(userIds));
  if (uniqueIds.length === 0) return new Map();

  const { data, error } = await supabase.from("app_users").select("id, discord_id").in("id", uniqueIds);
  if (error) throw new Error(error.message);

  const map = new Map<string, string>();
  for (const u of data ?? []) {
    if (u.discord_id) map.set(u.id as string, u.discord_id as string);
  }
  return map;
}

export interface RaidUnsaved {
  raidKey: string;
  abbr: string;
  color: string;
  unsaved: number;
  total: number;
}

export interface MemberLockoutSummary {
  userId: string;
  name: string;
  characterCount: number;
  dominantRoles: string[];
  byDifficulty: { difficulty: Difficulty; raids: RaidUnsaved[] }[];
}

const REVIEW_DIFFICULTIES: Difficulty[] = ["heroic", "mythic"];

const ROLE_ORDER = ["tank", "heal", "dps"];

export function dominantRolesByUser(
  characterRoles: { user_id: string; role: string | null }[],
  userIds: string[]
): Map<string, string[]> {
  const uniqueIds = Array.from(new Set(userIds));
  const result = new Map<string, string[]>();
  if (uniqueIds.length === 0) return result;

  const byUser = new Map<string, (string | null)[]>();
  for (const row of characterRoles) {
    const list = byUser.get(row.user_id) ?? [];
    list.push(row.role ?? null);
    byUser.set(row.user_id, list);
  }

  for (const userId of uniqueIds) {
    result.set(userId, dominantRolesOf(byUser.get(userId) ?? []));
  }
  return result;
}

export async function getDominantRolesForUsers(
  supabase: SupabaseClient,
  userIds: string[]
): Promise<Map<string, string[]>> {
  const uniqueIds = Array.from(new Set(userIds));
  if (uniqueIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from("characters")
    .select("user_id, role")
    .in("user_id", uniqueIds);
  if (error) throw new Error(error.message);

  return dominantRolesByUser((data ?? []) as { user_id: string; role: string | null }[], uniqueIds);
}

function dominantRolesOf(roles: (string | null)[]): string[] {
  const counts = new Map<string, number>();
  for (const role of roles) {
    if (role) counts.set(role, (counts.get(role) ?? 0) + 1);
  }
  if (counts.size === 0) return [];

  const max = Math.max(...counts.values());
  return Array.from(counts.entries())
    .filter(([, n]) => n === max)
    .map(([role]) => role)
    .sort((a, b) => ROLE_ORDER.indexOf(a) - ROLE_ORDER.indexOf(b));
}

export async function getLockoutSummariesForUsers(
  supabase: SupabaseClient,
  userIds: string[]
): Promise<Map<string, MemberLockoutSummary>> {
  const uniqueIds = Array.from(new Set(userIds));
  const result = new Map<string, MemberLockoutSummary>();
  if (uniqueIds.length === 0) return result;

  const [{ data: characters, error }, nameById, { raids }] = await Promise.all([
    supabase.from("characters").select("id, user_id, region, role").in("user_id", uniqueIds),
    resolveUserNames(supabase, uniqueIds),
    getCurrentRaidCatalog(supabase),
  ]);
  if (error) throw new Error(error.message);

  const rows = characters ?? [];
  const kills = await fetchAllBossKills(
    supabase,
    rows.map((c) => c.id as string)
  );

  for (const userId of uniqueIds) {
    const own = rows.filter((c) => c.user_id === userId);
    result.set(userId, {
      userId,
      name: nameById.get(userId) ?? "Desconocido",
      characterCount: own.length,
      dominantRoles: dominantRolesOf(own.map((c) => (c.role as string | null) ?? null)),
      byDifficulty: REVIEW_DIFFICULTIES.map((difficulty) => ({
        difficulty,
        raids: raids.map((raid) => {
          const unsaved = own.filter((c) => {
            const currentWeek = getCurrentLockoutWeek(c.region as string);
            return !kills.some(
              (k) =>
                k.character_id === c.id &&
                k.lockout_week === currentWeek &&
                k.boss_key.startsWith(`${raid.key}-${difficulty}-`)
            );
          }).length;
          return { raidKey: raid.key, abbr: raid.abbr, color: raid.color, unsaved, total: own.length };
        }),
      })),
    });
  }

  return result;
}

export async function getLockedAvailabilityIds(supabase: SupabaseClient): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("day_off_swap_requests")
    .select("requester_availability_id, recipient_availability_id")
    .in("status", OPEN_SWAP_STATUSES);
  if (error) throw new Error(error.message);

  const locked = new Set<string>();
  for (const row of data ?? []) {
    if (row.requester_availability_id) locked.add(row.requester_availability_id as string);
    if (row.recipient_availability_id) locked.add(row.recipient_availability_id as string);
  }
  return locked;
}

export interface DateCandidateEntry {
  userId: string;
  name: string;
  availabilityId: string;
}

export interface DateCandidateGroup {
  date: string;
  entries: DateCandidateEntry[];
}

export async function getFutureDaysOffByDate(
  supabase: SupabaseClient,
  excludeUserId: string
): Promise<DateCandidateGroup[]> {
  const today = getGuildToday();

  const [{ data: allRows, error: rowsError }, locked] = await Promise.all([
    supabase
      .from("availability")
      .select("id, user_id, date")
      .eq("available", false)
      .gte("date", today)
      .neq("user_id", excludeUserId)
      .order("date"),
    getLockedAvailabilityIds(supabase),
  ]);
  if (rowsError) throw new Error(rowsError.message);

  const rows = (allRows ?? []).filter((r) => !locked.has(r.id as string));

  const userIds = Array.from(new Set(rows.map((r) => r.user_id as string)));
  if (userIds.length === 0) return [];

  const nameById = await resolveUserNames(supabase, userIds);

  const grouped = new Map<string, DateCandidateGroup>();
  for (const row of rows) {
    const date = row.date as string;
    if (!grouped.has(date)) grouped.set(date, { date, entries: [] });
    grouped.get(date)!.entries.push({
      userId: row.user_id as string,
      name: nameById.get(row.user_id as string) ?? "Desconocido",
      availabilityId: row.id as string,
    });
  }

  for (const group of grouped.values()) {
    group.entries.sort((a, b) => a.name.localeCompare(b.name));
  }

  return Array.from(grouped.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export async function checkSwapConflict(
  supabase: SupabaseClient,
  userId: string,
  date: string,
  excludeAvailabilityId?: string
): Promise<boolean> {
  let query = supabase
    .from("availability")
    .select("id")
    .eq("user_id", userId)
    .eq("date", date)
    .eq("available", false);
  if (excludeAvailabilityId) query = query.neq("id", excludeAvailabilityId);

  const { data, error } = await query.limit(1);
  if (error) throw new Error(error.message);
  return (data?.length ?? 0) > 0;
}

interface SwapResult {
  success: boolean;
  error?: string;
}

export async function performAvailabilitySwap(
  supabase: SupabaseClient,
  requesterAvailabilityId: string | null,
  requesterId: string,
  recipientAvailabilityId: string | null,
  recipientId: string
): Promise<SwapResult> {
  if (!requesterAvailabilityId || !recipientAvailabilityId) {
    return { success: false, error: "Una de las 2 fechas del intercambio ya no existe." };
  }

  const { data: rows, error } = await supabase
    .from("availability")
    .select("id, user_id, date")
    .in("id", [requesterAvailabilityId, recipientAvailabilityId]);
  if (error) throw new Error(error.message);

  const requesterRow = (rows ?? []).find((r) => r.id === requesterAvailabilityId);
  const recipientRow = (rows ?? []).find((r) => r.id === recipientAvailabilityId);

  if (!requesterRow || requesterRow.user_id !== requesterId) {
    return { success: false, error: "El día libre que ofrecías ya no está disponible para intercambiar." };
  }
  if (!recipientRow || recipientRow.user_id !== recipientId) {
    return { success: false, error: "El día libre que pediste ya no está disponible para intercambiar." };
  }

  const [requesterAlreadyHasRecipientDate, recipientAlreadyHasRequesterDate] = await Promise.all([
    checkSwapConflict(supabase, requesterId, recipientRow.date, requesterAvailabilityId),
    checkSwapConflict(supabase, recipientId, requesterRow.date, recipientAvailabilityId),
  ]);
  if (requesterAlreadyHasRecipientDate || recipientAlreadyHasRequesterDate) {
    return { success: false, error: "Uno de los 2 ya tiene esa fecha como día libre, no se puede intercambiar." };
  }

  const { error: errorA } = await supabase
    .from("availability")
    .update({ user_id: recipientId })
    .eq("id", requesterAvailabilityId);
  if (errorA) return { success: false, error: errorA.message };

  const { error: errorB } = await supabase
    .from("availability")
    .update({ user_id: requesterId })
    .eq("id", recipientAvailabilityId);
  if (errorB) {
    await supabase.from("availability").update({ user_id: requesterId }).eq("id", requesterAvailabilityId);
    return { success: false, error: errorB.message };
  }

  return { success: true };
}

export async function expireConflictingRequests(
  supabase: SupabaseClient,
  involvedAvailabilityIds: string[],
  excludeRequestId: string
): Promise<void> {
  const orFilter = involvedAvailabilityIds
    .map((id) => `requester_availability_id.eq.${id},recipient_availability_id.eq.${id}`)
    .join(",");

  const { error } = await supabase
    .from("day_off_swap_requests")
    .update({ status: "expired", responded_at: new Date().toISOString() })
    .eq("status", "pending")
    .neq("id", excludeRequestId)
    .or(orFilter);

  if (error) console.error("Error expirando solicitudes de intercambio conflictivas:", error.message);
}
