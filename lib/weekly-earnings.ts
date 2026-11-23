import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getCurrentGoldRate } from "@/lib/balance";

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

export function getEarningsWeekRange(reference: Date = new Date()): { start: string; end: string } {
  const day = reference.getUTCDay();
  const diffToTuesday = (day - 2 + 7) % 7;
  const tuesday = new Date(
    Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), reference.getUTCDate() - diffToTuesday)
  );
  const monday = new Date(tuesday);
  monday.setUTCDate(tuesday.getUTCDate() + 6);
  return { start: tuesday.toISOString().slice(0, 10), end: monday.toISOString().slice(0, 10) };
}

export interface WeekMemberEarnings {
  user_id: string;
  ib_paid: number;
  gold_paid_usd: number;
  gold_paid_amount: number;
  ob_paid: number;
  total_generated: number;
  total_paid: number;
}

function emptyEarnings(user_id: string): WeekMemberEarnings {
  return { user_id, ib_paid: 0, gold_paid_usd: 0, gold_paid_amount: 0, ob_paid: 0, total_generated: 0, total_paid: 0 };
}

export async function computeWeekEarnings(
  supabase: SupabaseClient,
  weekStart: string,
  weekEnd: string
): Promise<WeekMemberEarnings[]> {
  const rangeStart = `${weekStart}T00:00:00.000Z`;
  const rangeEnd = `${weekEnd}T23:59:59.999Z`;

  const [adjustmentsRes, cutsRes, goldPerUsd] = await Promise.all([
    supabase
      .from("balance_adjustments")
      .select("user_id, type, amount")
      .eq("paid", true)
      .gte("paid_at", rangeStart)
      .lte("paid_at", rangeEnd),
    supabase
      .from("service_cuts")
      .select("user_id, cut_amount, services_sold!inner(fully_paid, paid_at)")
      .eq("services_sold.fully_paid", true)
      .gte("services_sold.paid_at", rangeStart)
      .lte("services_sold.paid_at", rangeEnd),
    getCurrentGoldRate(supabase),
  ]);

  if (adjustmentsRes.error) throw adjustmentsRes.error;
  if (cutsRes.error) throw cutsRes.error;

  const byUser = new Map<string, WeekMemberEarnings>();
  const getEntry = (userId: string) => {
    const existing = byUser.get(userId);
    if (existing) return existing;
    const fresh = emptyEarnings(userId);
    byUser.set(userId, fresh);
    return fresh;
  };

  for (const row of adjustmentsRes.data ?? []) {
    const entry = getEntry(row.user_id);
    if (row.type === "gold") {
      entry.gold_paid_amount += Number(row.amount);
      entry.gold_paid_usd += goldPerUsd ? Number(row.amount) / goldPerUsd : 0;
    } else {
      entry.ib_paid += Number(row.amount);
    }
  }

  for (const row of cutsRes.data ?? []) {
    if (!row.user_id) continue;
    getEntry(row.user_id).ob_paid += Number(row.cut_amount);
  }

  for (const entry of byUser.values()) {
    const total = entry.ib_paid + entry.gold_paid_usd + entry.ob_paid;
    entry.total_generated = total;
    entry.total_paid = total;
  }

  return Array.from(byUser.values());
}

export interface WeeklyEarningsRow {
  id: string;
  user_id: string;
  week_start: string;
  week_end: string;
  ib_paid: number;
  gold_paid_usd: number;
  gold_paid_amount: number;
  ob_paid: number;
  total_generated: number;
  total_paid: number;
  status: "pendiente" | "pagado";
  created_at: string;
}

const WEEKLY_EARNINGS_COLUMNS =
  "id, user_id, week_start, week_end, ib_paid, gold_paid_usd, gold_paid_amount, ob_paid, total_generated, total_paid, status, created_at";

export interface LastClosedWeek {
  weekStart: string;
  weekEnd: string;
  closedAt: string;
}

export async function getLastClosedWeek(supabase: SupabaseClient): Promise<LastClosedWeek | null> {
  const { data, error } = await supabase
    .from("weekly_earnings")
    .select("week_start, week_end, created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Error consultando último cierre semanal:", JSON.stringify(error, null, 2));
    return null;
  }
  if (!data) return null;

  return { weekStart: data.week_start, weekEnd: data.week_end, closedAt: data.created_at };
}

function toWeeklyEarningsRow(r: Record<string, unknown>): WeeklyEarningsRow {
  return {
    id: r.id as string,
    user_id: r.user_id as string,
    week_start: r.week_start as string,
    week_end: r.week_end as string,
    ib_paid: Number(r.ib_paid),
    gold_paid_usd: Number(r.gold_paid_usd),
    gold_paid_amount: Number(r.gold_paid_amount),
    ob_paid: Number(r.ob_paid),
    total_generated: Number(r.total_generated),
    total_paid: Number(r.total_paid),
    status: r.status as "pendiente" | "pagado",
    created_at: r.created_at as string,
  };
}

export async function getMemberWeeklyHistory(
  supabase: SupabaseClient,
  userId: string
): Promise<WeeklyEarningsRow[]> {
  const { data, error } = await supabase
    .from("weekly_earnings")
    .select(WEEKLY_EARNINGS_COLUMNS)
    .eq("user_id", userId)
    .order("week_start", { ascending: false });

  if (error) throw error;

  return (data ?? []).map(toWeeklyEarningsRow);
}

export async function getGuildWeekSnapshot(
  supabase: SupabaseClient,
  weekStart: string
): Promise<WeeklyEarningsRow[]> {
  const { data, error } = await supabase
    .from("weekly_earnings")
    .select(WEEKLY_EARNINGS_COLUMNS)
    .eq("week_start", weekStart);

  if (error) throw error;

  return (data ?? []).map(toWeeklyEarningsRow);
}

export async function closeWeek(
  supabase: SupabaseClient,
  weekStart: string,
  weekEnd: string,
  createdBy: string
): Promise<{ closed: number; skipped: number }> {
  const earnings = await computeWeekEarnings(supabase, weekStart, weekEnd);
  const withEarnings = earnings.filter((e) => e.total_paid > 0);

  if (withEarnings.length === 0) return { closed: 0, skipped: 0 };

  const rows = withEarnings.map((e) => ({
    user_id: e.user_id,
    week_start: weekStart,
    week_end: weekEnd,
    ib_paid: e.ib_paid,
    gold_paid_usd: e.gold_paid_usd,
    gold_paid_amount: e.gold_paid_amount,
    ob_paid: e.ob_paid,
    total_generated: e.total_generated,
    total_paid: e.total_paid,
    status: "pagado",
    created_by: createdBy,
  }));

  const { data, error } = await supabase
    .from("weekly_earnings")
    .upsert(rows, { onConflict: "user_id,week_start", ignoreDuplicates: true })
    .select("id");

  if (error) throw error;

  const closed = data?.length ?? 0;
  return { closed, skipped: withEarnings.length - closed };
}

export async function reopenWeek(supabase: SupabaseClient, weekStart: string): Promise<{ deleted: number }> {
  const { data, error } = await supabase
    .from("weekly_earnings")
    .delete()
    .eq("week_start", weekStart)
    .select("id");

  if (error) throw error;

  return { deleted: data?.length ?? 0 };
}
