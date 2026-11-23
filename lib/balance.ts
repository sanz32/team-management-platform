import { createServerSupabaseClient } from "@/lib/supabase-server";
import { notifyObDiscount } from "@/lib/notifications";

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

export async function getPendingOBTotal(supabase: SupabaseClient, userId: string): Promise<number> {
  const [{ data: cuts }, confirmedDiscount] = await Promise.all([
    supabase.from("service_cuts").select("cut_amount").eq("user_id", userId).eq("paid", false),
    getConfirmedObDiscountTotal(supabase, userId),
  ]);

  const rawTotal = (cuts ?? []).reduce((sum, c) => sum + Number(c.cut_amount), 0);
  return Math.max(0, rawTotal - confirmedDiscount);
}

export async function getAllPendingOBTotalsByUser(supabase: SupabaseClient): Promise<Map<string, number>> {
  const [{ data: cuts }, confirmedDiscountByUser] = await Promise.all([
    supabase.from("service_cuts").select("user_id, cut_amount").eq("paid", false).not("user_id", "is", null),
    getAllConfirmedObDiscountTotalsByUser(supabase),
  ]);

  const rawByUser = new Map<string, number>();
  for (const row of cuts ?? []) {
    const userId = row.user_id as string;
    rawByUser.set(userId, (rawByUser.get(userId) ?? 0) + Number(row.cut_amount));
  }

  const result = new Map<string, number>();
  for (const [userId, raw] of rawByUser) {
    result.set(userId, Math.max(0, raw - (confirmedDiscountByUser.get(userId) ?? 0)));
  }
  return result;
}

export interface GuildObTotal {
  total: number;
  usersWithPending: number;
}

export async function getGuildPendingOBTotal(supabase: SupabaseClient): Promise<GuildObTotal> {
  const pendingByUser = await getAllPendingOBTotalsByUser(supabase);
  let total = 0;
  let usersWithPending = 0;
  for (const pending of pendingByUser.values()) {
    if (pending > 0) {
      total += pending;
      usersWithPending += 1;
    }
  }
  return { total, usersWithPending };
}

export async function getObDiscountTotal(supabase: SupabaseClient, userId: string): Promise<number> {
  const { data } = await supabase
    .from("ob_discounts")
    .select("amount")
    .eq("user_id", userId)
    .eq("reverted", false);

  return (data ?? []).reduce((sum, r) => sum + Number(r.amount), 0);
}

async function getClaimedObDiscountTotal(supabase: SupabaseClient, userId: string, onlyPaid: boolean): Promise<number> {
  let query = supabase.from("payout_batch_items").select("discount_applied").eq("user_id", userId);
  if (onlyPaid) query = query.eq("status", "paid");
  const { data } = await query;
  return (data ?? []).reduce((sum, r) => sum + Number(r.discount_applied ?? 0), 0);
}

async function getAllClaimedObDiscountTotalsByUser(supabase: SupabaseClient, onlyPaid: boolean): Promise<Map<string, number>> {
  let query = supabase.from("payout_batch_items").select("user_id, discount_applied").not("user_id", "is", null);
  if (onlyPaid) query = query.eq("status", "paid");
  const { data: items } = await query;

  const claimedByUser = new Map<string, number>();
  for (const row of items ?? []) {
    const userId = row.user_id as string;
    claimedByUser.set(userId, (claimedByUser.get(userId) ?? 0) + Number(row.discount_applied ?? 0));
  }
  return claimedByUser;
}

export async function getAvailableObDiscountTotal(supabase: SupabaseClient, userId: string): Promise<number> {
  const [discountTotal, claimedTotal] = await Promise.all([
    getObDiscountTotal(supabase, userId),
    getClaimedObDiscountTotal(supabase, userId, false),
  ]);
  return Math.max(0, discountTotal - claimedTotal);
}

export async function getAllAvailableObDiscountTotalsByUser(supabase: SupabaseClient): Promise<Map<string, number>> {
  const [{ data: discounts }, claimedByUser] = await Promise.all([
    supabase.from("ob_discounts").select("user_id, amount").eq("reverted", false),
    getAllClaimedObDiscountTotalsByUser(supabase, false),
  ]);

  const discountByUser = new Map<string, number>();
  for (const row of discounts ?? []) {
    const userId = row.user_id as string;
    discountByUser.set(userId, (discountByUser.get(userId) ?? 0) + Number(row.amount));
  }

  const result = new Map<string, number>();
  for (const [userId, total] of discountByUser) {
    result.set(userId, Math.max(0, total - (claimedByUser.get(userId) ?? 0)));
  }
  return result;
}

export async function getConfirmedObDiscountTotal(supabase: SupabaseClient, userId: string): Promise<number> {
  const [discountTotal, claimedTotal] = await Promise.all([
    getObDiscountTotal(supabase, userId),
    getClaimedObDiscountTotal(supabase, userId, true),
  ]);
  return Math.max(0, discountTotal - claimedTotal);
}

export async function getAllConfirmedObDiscountTotalsByUser(supabase: SupabaseClient): Promise<Map<string, number>> {
  const [{ data: discounts }, claimedByUser] = await Promise.all([
    supabase.from("ob_discounts").select("user_id, amount").eq("reverted", false),
    getAllClaimedObDiscountTotalsByUser(supabase, true),
  ]);

  const discountByUser = new Map<string, number>();
  for (const row of discounts ?? []) {
    const userId = row.user_id as string;
    discountByUser.set(userId, (discountByUser.get(userId) ?? 0) + Number(row.amount));
  }

  const result = new Map<string, number>();
  for (const [userId, total] of discountByUser) {
    result.set(userId, Math.max(0, total - (claimedByUser.get(userId) ?? 0)));
  }
  return result;
}

export interface ObDiscountHistoryRow {
  id: string;
  amount: number;
  reason: string | null;
  reverted: boolean;
  reverted_at: string | null;
  created_at: string;
}

export async function getObDiscountHistory(
  supabase: SupabaseClient,
  userId: string
): Promise<ObDiscountHistoryRow[]> {
  const { data } = await supabase
    .from("ob_discounts")
    .select("id, amount, reason, reverted, reverted_at, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  return (data ?? []).map((r) => ({
    id: r.id,
    amount: Number(r.amount),
    reason: r.reason,
    reverted: r.reverted,
    reverted_at: r.reverted_at,
    created_at: r.created_at,
  }));
}

export interface ObDiscountResult {
  discountedAmount: number;
  remainingPending: number;
}

export async function applyObDiscount(
  supabase: SupabaseClient,
  userId: string,
  amount: number,
  reason: string | null,
  createdBy: string | null
): Promise<ObDiscountResult> {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("El monto a descontar debe ser mayor a cero");
  }

  const pending = await getPendingOBTotal(supabase, userId);
  if (pending <= 0) {
    throw new Error("Este miembro no tiene saldo de Runs OB pendiente para descontar");
  }

  const discountedAmount = Math.min(amount, pending);

  const { error } = await supabase.from("ob_discounts").insert({
    user_id: userId,
    amount: discountedAmount,
    reason: reason || null,
    created_by: createdBy,
    reverted: false,
  });
  if (error) throw error;

  notifyObDiscount({ userId, amount: discountedAmount, reason }, supabase).catch(() => {});

  return { discountedAmount, remainingPending: pending - discountedAmount };
}

export interface BulkObDiscountResult {
  amountPerUser: number;
  totalDiscounted: number;
  usersAffected: number;
}

export async function applyObDiscountForAllUsers(
  supabase: SupabaseClient,
  amountPerUser: number,
  reason: string | null,
  createdBy: string | null
): Promise<BulkObDiscountResult> {
  if (!Number.isFinite(amountPerUser) || amountPerUser <= 0) {
    throw new Error("El monto a descontar debe ser mayor a cero");
  }

  const pendingByUser = await getAllPendingOBTotalsByUser(supabase);

  let totalDiscounted = 0;
  let usersAffected = 0;

  for (const [userId, pending] of pendingByUser) {
    if (pending <= 0) continue;
    const discountedAmount = Math.min(amountPerUser, pending);
    const { error } = await supabase.from("ob_discounts").insert({
      user_id: userId,
      amount: discountedAmount,
      reason: reason || null,
      created_by: createdBy,
      reverted: false,
    });
    if (error) throw error;
    notifyObDiscount({ userId, amount: discountedAmount, reason }, supabase).catch(() => {});
    totalDiscounted += discountedAmount;
    usersAffected += 1;
  }

  return { amountPerUser, totalDiscounted, usersAffected };
}

export async function revertObDiscount(
  supabase: SupabaseClient,
  id: string,
  revertedBy: string | null
): Promise<{ userId: string; amount: number } | null> {
  const { data: existing } = await supabase
    .from("ob_discounts")
    .select("id, user_id, amount, reverted")
    .eq("id", id)
    .maybeSingle();

  if (!existing || existing.reverted) return null;

  const { error } = await supabase
    .from("ob_discounts")
    .update({ reverted: true, reverted_at: new Date().toISOString(), reverted_by: revertedBy })
    .eq("id", id);
  if (error) throw error;

  return { userId: existing.user_id, amount: Number(existing.amount) };
}

export interface ActiveObDiscountGroup {
  reason: string | null;
  totalAmount: number;
  usersAffected: number;
}

export async function getActiveObDiscountGroups(supabase: SupabaseClient): Promise<ActiveObDiscountGroup[]> {
  const { data } = await supabase.from("ob_discounts").select("reason, amount, user_id").eq("reverted", false);

  const groups = new Map<string | null, { totalAmount: number; users: Set<string> }>();
  for (const row of data ?? []) {
    const key: string | null = row.reason ?? null;
    const entry = groups.get(key) ?? { totalAmount: 0, users: new Set<string>() };
    entry.totalAmount += Number(row.amount);
    entry.users.add(row.user_id as string);
    groups.set(key, entry);
  }

  return Array.from(groups.entries())
    .map(([reason, { totalAmount, users }]) => ({ reason, totalAmount, usersAffected: users.size }))
    .sort((a, b) => b.totalAmount - a.totalAmount);
}

export interface BulkObDiscountRevertResult {
  amount: number;
  users: number;
}

export async function revertObDiscountsByReason(
  supabase: SupabaseClient,
  reason: string | null,
  revertedBy: string | null
): Promise<BulkObDiscountRevertResult> {
  const payload = { reverted: true, reverted_at: new Date().toISOString(), reverted_by: revertedBy };
  const base = supabase.from("ob_discounts").update(payload).eq("reverted", false);
  const { data, error } =
    reason === null
      ? await base.is("reason", null).select("amount, user_id")
      : await base.eq("reason", reason).select("amount, user_id");

  if (error) throw error;

  const rows = data ?? [];
  const amount = rows.reduce((sum, r) => sum + Number(r.amount), 0);
  const users = new Set(rows.map((r) => r.user_id)).size;

  return { amount, users };
}

export async function getAdjustmentTotal(
  supabase: SupabaseClient,
  userId: string,
  type: "ib" | "gold"
): Promise<number> {
  const { data } = await supabase
    .from("balance_adjustments")
    .select("amount")
    .eq("user_id", userId)
    .eq("type", type)
    .eq("paid", false);

  return (data ?? []).reduce((sum, r) => sum + Number(r.amount), 0);
}

export interface AdjustmentHistoryRow {
  id: string;
  amount: number;
  note: string | null;
  paid: boolean;
  paid_at: string | null;
  created_at: string;
}

export interface ObHistoryRow {
  id: string;
  amount: number;
  description: string;
  sold_date: string;
  paid: boolean;
}

export interface BalanceHistory {
  ib: AdjustmentHistoryRow[];
  gold: AdjustmentHistoryRow[];
  ob: ObHistoryRow[];
  obDiscounts: ObDiscountHistoryRow[];
}

export async function getBalanceHistory(supabase: SupabaseClient, userId: string): Promise<BalanceHistory> {
  const [adjustments, cuts, obDiscounts] = await Promise.all([
    supabase
      .from("balance_adjustments")
      .select("id, type, amount, note, paid, paid_at, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
    supabase
      .from("service_cuts")
      .select("id, cut_amount, services_sold!inner(description, sold_date, fully_paid)")
      .eq("user_id", userId)
      .order("id", { ascending: false }),
    getObDiscountHistory(supabase, userId),
  ]);

  const ib: AdjustmentHistoryRow[] = [];
  const gold: AdjustmentHistoryRow[] = [];
  for (const row of adjustments.data ?? []) {
    const entry: AdjustmentHistoryRow = {
      id: row.id,
      amount: Number(row.amount),
      note: row.note,
      paid: row.paid,
      paid_at: row.paid_at,
      created_at: row.created_at,
    };
    (row.type === "gold" ? gold : ib).push(entry);
  }

  const ob: ObHistoryRow[] = (cuts.data ?? []).map((row) => {
    const service = Array.isArray(row.services_sold) ? row.services_sold[0] : row.services_sold;
    return {
      id: row.id,
      amount: Number(row.cut_amount),
      description: service?.description ?? "Run",
      sold_date: service?.sold_date ?? "",
      paid: service?.fully_paid ?? false,
    };
  });

  return { ib, gold, ob, obDiscounts };
}

export async function markAllAdjustmentsPaid(
  supabase: SupabaseClient,
  type: "ib" | "gold"
): Promise<{ amount: number; users: number }> {
  const { data, error } = await supabase
    .from("balance_adjustments")
    .update({ paid: true, paid_at: new Date().toISOString() })
    .eq("type", type)
    .eq("paid", false)
    .select("amount, user_id");

  if (error) throw error;

  const rows = data ?? [];
  const amount = rows.reduce((sum, r) => sum + Number(r.amount), 0);
  const users = new Set(rows.map((r) => r.user_id)).size;

  return { amount, users };
}

export interface PartialPaymentResult {
  paidAmount: number;
  remainingPending: number;
}

export async function payPartialAdjustment(
  supabase: SupabaseClient,
  userId: string,
  type: "ib" | "gold",
  amountToPay: number,
  createdBy: string | null
): Promise<PartialPaymentResult> {
  if (!Number.isFinite(amountToPay) || amountToPay <= 0) {
    throw new Error("El monto a pagar debe ser mayor a cero");
  }

  const { data, error } = await supabase
    .from("balance_adjustments")
    .select("id, amount")
    .eq("user_id", userId)
    .eq("type", type)
    .eq("paid", false)
    .order("created_at", { ascending: true });

  if (error) throw error;

  const rows = data ?? [];
  const totalPending = rows.reduce((sum, r) => sum + Number(r.amount), 0);
  if (amountToPay > totalPending + 0.005) {
    throw new Error("El monto a pagar no puede superar el balance pendiente");
  }

  const paidAt = new Date().toISOString();
  let remaining = amountToPay;

  for (const row of rows) {
    if (remaining <= 0) break;
    const rowAmount = Number(row.amount);

    if (rowAmount <= remaining + 0.005) {
      const { error: updateError } = await supabase
        .from("balance_adjustments")
        .update({ paid: true, paid_at: paidAt })
        .eq("id", row.id);
      if (updateError) throw updateError;
      remaining -= rowAmount;
    } else {
      const { error: updateError } = await supabase
        .from("balance_adjustments")
        .update({ amount: rowAmount - remaining })
        .eq("id", row.id);
      if (updateError) throw updateError;

      const { error: insertError } = await supabase.from("balance_adjustments").insert({
        user_id: userId,
        type,
        amount: remaining,
        note: "Pago parcial",
        paid: true,
        paid_at: paidAt,
        created_by: createdBy,
      });
      if (insertError) throw insertError;

      remaining = 0;
    }
  }

  return { paidAmount: amountToPay, remainingPending: totalPending - amountToPay };
}

export interface BulkPartialPaymentResult {
  amountPerUser: number;
  totalPaid: number;
  usersAffected: number;
}

export async function payPartialAdjustmentForAllUsers(
  supabase: SupabaseClient,
  type: "ib" | "gold",
  amountPerUser: number,
  createdBy: string | null
): Promise<BulkPartialPaymentResult> {
  if (!Number.isFinite(amountPerUser) || amountPerUser <= 0) {
    throw new Error("El monto a pagar debe ser mayor a cero");
  }

  const { data, error } = await supabase
    .from("balance_adjustments")
    .select("user_id, amount")
    .eq("type", type)
    .eq("paid", false);

  if (error) throw error;

  const pendingByUser = new Map<string, number>();
  for (const row of data ?? []) {
    const userId = row.user_id as string;
    pendingByUser.set(userId, (pendingByUser.get(userId) ?? 0) + Number(row.amount));
  }

  let totalPaid = 0;
  let usersAffected = 0;

  for (const [userId, pending] of pendingByUser) {
    if (pending <= 0) continue;
    const target = Math.min(amountPerUser, pending);
    const { paidAmount } = await payPartialAdjustment(supabase, userId, type, target, createdBy);
    totalPaid += paidAmount;
    usersAffected += 1;
  }

  return { amountPerUser, totalPaid, usersAffected };
}

export async function getCurrentGoldRate(supabase: SupabaseClient): Promise<number | null> {
  const { data } = await supabase
    .from("gold_exchange_rate")
    .select("gold_per_usd")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data ? Number(data.gold_per_usd) : null;
}

export interface BalanceSummary {
  ib: number;
  ob: number;
  goldAmount: number;
  goldPerUsd: number | null;
  goldUsd: number;
  total: number;
}

export async function getBalanceSummary(supabase: SupabaseClient, userId: string): Promise<BalanceSummary> {
  const [ob, ib, goldAmount, goldPerUsd] = await Promise.all([
    getPendingOBTotal(supabase, userId),
    getAdjustmentTotal(supabase, userId, "ib"),
    getAdjustmentTotal(supabase, userId, "gold"),
    getCurrentGoldRate(supabase),
  ]);

  const goldUsd = goldPerUsd ? goldAmount / goldPerUsd : 0;

  return { ib, ob, goldAmount, goldPerUsd, goldUsd, total: ib + ob + goldUsd };
}
