import { createServerSupabaseClient } from "@/lib/supabase-server";
import { notifyPaymentSummary } from "@/lib/notifications";
import { getAllAvailableObDiscountTotalsByUser } from "@/lib/balance";

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;
type Row = Record<string, unknown>;

function raise(error: { message: string } | null): asserts error is null {
  if (error) throw new Error(error.message);
}

function floorToCents(amount: number): number {
  return Math.floor(amount * 100 + 1e-9) / 100;
}

export interface PayoutRun {
  id: string;
  description: string;
  soldDate: string;
  totalPrice: number;
  currency: string;
  advUsername: string | null;
  pendingAmount: number;
}

export async function getUnpaidRuns(supabase: SupabaseClient): Promise<PayoutRun[]> {
  const [servicesResult, cutsResult, usersResult] = await Promise.all([
    supabase
      .from("services_sold")
      .select("id, description, sold_date, total_price, currency, adv_user_id")
      .eq("fully_paid", false),
    supabase.from("service_cuts").select("service_id, user_id, freelancer_id, cut_amount, paid"),
    supabase.from("app_users").select("id, discord_username"),
  ]);
  raise(servicesResult.error);
  raise(cutsResult.error);
  raise(usersResult.error);

  const usersById = new Map<string, Row>((usersResult.data ?? []).map((u: Row) => [u.id as string, u]));

  const pendingByService = new Map<string, number>();
  for (const cut of cutsResult.data ?? []) {
    if (cut.paid) continue;
    if (!cut.user_id && !cut.freelancer_id) continue;
    const serviceId = cut.service_id as string;
    pendingByService.set(serviceId, (pendingByService.get(serviceId) ?? 0) + Number(cut.cut_amount));
  }

  const runs: PayoutRun[] = [];
  for (const s of servicesResult.data ?? []) {
    const pendingAmount = pendingByService.get(s.id as string) ?? 0;
    if (pendingAmount <= 0) continue;
    runs.push({
      id: s.id as string,
      description: s.description as string,
      soldDate: s.sold_date as string,
      totalPrice: Number(s.total_price),
      currency: s.currency as string,
      advUsername: s.adv_user_id
        ? ((usersById.get(s.adv_user_id as string)?.discord_username as string | undefined) ?? null)
        : null,
      pendingAmount,
    });
  }

  return runs.sort((a, b) => a.soldDate.localeCompare(b.soldDate));
}

export async function hasAnyPaidCuts(supabase: SupabaseClient, serviceId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("service_cuts")
    .select("id")
    .eq("service_id", serviceId)
    .eq("paid", true)
    .limit(1);
  raise(error);
  return (data ?? []).length > 0;
}

export interface PayoutCandidate {
  key: string;
  userId: string | null;
  freelancerId: string | null;
  isFreelance: boolean;
  displayName: string;
  nickname: string | null;
  binanceId: string | null;
  pendingAmount: number;
  discountApplied: number;
  serviceCutIds: string[];
  hasOpenBatch: boolean;
}

export async function getPayoutCandidatesForRuns(
  supabase: SupabaseClient,
  runIds: string[]
): Promise<PayoutCandidate[]> {
  if (runIds.length === 0) return [];

  const [cutsResult, usersResult, freelancersResult, openItemsResult, availableDiscountByUser] = await Promise.all([
    supabase
      .from("service_cuts")
      .select("id, service_id, user_id, freelancer_id, cut_amount")
      .in("service_id", runIds)
      .eq("paid", false),
    supabase.from("app_users").select("id, discord_username, nickname, binance_id"),
    supabase.from("freelancers").select("id, name, binance_id"),
    supabase.from("payout_batch_items").select("service_cut_ids").eq("status", "pending"),
    getAllAvailableObDiscountTotalsByUser(supabase),
  ]);
  raise(cutsResult.error);
  raise(usersResult.error);
  raise(freelancersResult.error);
  raise(openItemsResult.error);

  const usersById = new Map<string, Row>((usersResult.data ?? []).map((u: Row) => [u.id as string, u]));
  const freelancersById = new Map<string, Row>((freelancersResult.data ?? []).map((f: Row) => [f.id as string, f]));

  const reservedCutIds = new Set<string>();
  for (const item of openItemsResult.data ?? []) {
    for (const cutId of (item.service_cut_ids as string[] | null) ?? []) reservedCutIds.add(cutId);
  }

  const byKey = new Map<string, { userId: string | null; freelancerId: string | null; amount: number; cutIds: string[] }>();
  const hasOpenBatchKeys = new Set<string>();
  for (const cut of cutsResult.data ?? []) {
    const userId = cut.user_id as string | null;
    const freelancerId = cut.freelancer_id as string | null;
    if (!userId && !freelancerId) continue;

    const key = userId ? `user:${userId}` : `freelancer:${freelancerId}`;
    if (reservedCutIds.has(cut.id as string)) {
      hasOpenBatchKeys.add(key);
      continue;
    }

    const entry = byKey.get(key) ?? { userId, freelancerId, amount: 0, cutIds: [] };
    entry.amount = floorToCents(entry.amount + Number(cut.cut_amount));
    entry.cutIds.push(cut.id as string);
    byKey.set(key, entry);
  }

  const candidates: PayoutCandidate[] = [];
  for (const [key, { userId, freelancerId, amount, cutIds }] of byKey) {
    if (userId) {
      const user = usersById.get(userId);
      const discountApplied = floorToCents(Math.min(amount, availableDiscountByUser.get(userId) ?? 0));
      candidates.push({
        key,
        userId,
        freelancerId: null,
        isFreelance: false,
        displayName: (user?.discord_username as string | undefined) ?? "Desconocido",
        nickname: (user?.nickname as string | null | undefined) ?? null,
        binanceId: (user?.binance_id as string | null | undefined) ?? null,
        pendingAmount: floorToCents(amount - discountApplied),
        discountApplied,
        serviceCutIds: cutIds,
        hasOpenBatch: hasOpenBatchKeys.has(key),
      });
    } else {
      const freelancer = freelancersById.get(freelancerId as string);
      candidates.push({
        key,
        userId: null,
        freelancerId,
        isFreelance: true,
        displayName: (freelancer?.name as string | undefined) ?? "Freelance",
        nickname: null,
        binanceId: (freelancer?.binance_id as string | null | undefined) ?? null,
        pendingAmount: amount,
        discountApplied: 0,
        serviceCutIds: cutIds,
        hasOpenBatch: hasOpenBatchKeys.has(key),
      });
    }
  }

  return candidates.sort((a, b) => b.pendingAmount - a.pendingAmount);
}

export interface PayoutBatchItem {
  id: string;
  userId: string | null;
  freelancerId: string | null;
  isFreelance: boolean;
  discordUsername: string;
  binanceId: string;
  amount: number;
  discountApplied: number;
  serviceCutIds: string[];
  status: "pending" | "paid";
  txReference: string | null;
  paidAt: string | null;
  paidBy: string | null;
}

export interface PayoutBatch {
  id: string;
  currency: string;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
  items: PayoutBatchItem[];
  status: "pending" | "partially_paid" | "paid";
  total: number;
}

function toPayoutBatchItem(item: Row): PayoutBatchItem {
  const freelancerId = (item.freelancer_id as string | null) ?? null;
  return {
    id: item.id as string,
    userId: (item.user_id as string | null) ?? null,
    freelancerId,
    isFreelance: freelancerId !== null,
    discordUsername: item.discord_username as string,
    binanceId: item.binance_id as string,
    amount: Number(item.amount),
    discountApplied: Number(item.discount_applied ?? 0),
    serviceCutIds: (item.service_cut_ids as string[] | null) ?? [],
    status: item.status as "pending" | "paid",
    txReference: (item.tx_reference as string | null) ?? null,
    paidAt: (item.paid_at as string | null) ?? null,
    paidBy: (item.paid_by as string | null) ?? null,
  };
}

function deriveBatchStatus(items: PayoutBatchItem[]): PayoutBatch["status"] {
  if (items.length === 0) return "pending";
  const paidCount = items.filter((i) => i.status === "paid").length;
  if (paidCount === 0) return "pending";
  if (paidCount === items.length) return "paid";
  return "partially_paid";
}

function toPayoutBatch(batch: Row, itemRows: Row[]): PayoutBatch {
  const items = itemRows.map(toPayoutBatchItem).sort((a, b) => a.discordUsername.localeCompare(b.discordUsername));

  return {
    id: batch.id as string,
    currency: batch.currency as string,
    note: (batch.note as string | null) ?? null,
    createdBy: (batch.created_by as string | null) ?? null,
    createdAt: batch.created_at as string,
    items,
    status: deriveBatchStatus(items),
    total: items.reduce((sum, i) => sum + i.amount, 0),
  };
}

export interface CreatePayoutBatchItemInput {
  userId: string | null;
  freelancerId: string | null;
  serviceCutIds: string[];
}

export interface CreatePayoutBatchInput {
  currency: string;
  note: string | null;
  items: CreatePayoutBatchItemInput[];
}

export async function createPayoutBatch(
  supabase: SupabaseClient,
  input: CreatePayoutBatchInput,
  createdBy: string | null
): Promise<PayoutBatch> {
  if (!input.items.length) {
    throw new Error("El lote necesita al menos un booster incluido");
  }

  for (const item of input.items) {
    if (!item.userId === !item.freelancerId) {
      throw new Error("Cada ítem necesita exactamente un miembro o un freelancer");
    }
  }

  const allCutIds = input.items.flatMap((i) => i.serviceCutIds);
  if (allCutIds.length === 0) {
    throw new Error("Cada booster necesita al menos una run pendiente incluida");
  }
  if (new Set(allCutIds).size !== allCutIds.length) {
    throw new Error("Una run seleccionada está repetida en el lote");
  }

  const userIds = input.items.map((i) => i.userId).filter((id): id is string => Boolean(id));
  const freelancerIds = input.items.map((i) => i.freelancerId).filter((id): id is string => Boolean(id));

  const [usersResult, freelancersResult, cutsResult, openItemsResult, availableDiscountByUser] = await Promise.all([
    supabase.from("app_users").select("id, discord_username, binance_id").in("id", userIds.length ? userIds : [""]),
    supabase.from("freelancers").select("id, name, binance_id").in("id", freelancerIds.length ? freelancerIds : [""]),
    supabase.from("service_cuts").select("id, user_id, freelancer_id, cut_amount, paid").in("id", allCutIds),
    supabase.from("payout_batch_items").select("service_cut_ids").eq("status", "pending"),
    getAllAvailableObDiscountTotalsByUser(supabase),
  ]);
  raise(usersResult.error);
  raise(freelancersResult.error);
  raise(cutsResult.error);
  raise(openItemsResult.error);

  const usersById = new Map<string, Row>((usersResult.data ?? []).map((u: Row) => [u.id as string, u]));
  const freelancersById = new Map<string, Row>((freelancersResult.data ?? []).map((f: Row) => [f.id as string, f]));
  const cutsById = new Map<string, Row>((cutsResult.data ?? []).map((c: Row) => [c.id as string, c]));

  const reservedCutIds = new Set<string>();
  for (const item of openItemsResult.data ?? []) {
    for (const cutId of (item.service_cut_ids as string[] | null) ?? []) reservedCutIds.add(cutId);
  }
  for (const cutId of allCutIds) {
    if (reservedCutIds.has(cutId)) {
      throw new Error(
        "Una run seleccionada ya está en otro lote sin confirmar -- confírmalo o elimínalo antes de volver a incluirla"
      );
    }
  }

  const remainingDiscountByUser = new Map(availableDiscountByUser);

  const itemRows = input.items.map((item) => {
    const isFreelance = Boolean(item.freelancerId);
    const profile = isFreelance ? freelancersById.get(item.freelancerId as string) : usersById.get(item.userId as string);
    const name = isFreelance
      ? ((profile?.name as string | undefined) ?? "Freelance")
      : ((profile?.discord_username as string | undefined) ?? "Desconocido");
    const binanceId = (profile?.binance_id as string | null | undefined)?.trim();
    if (!binanceId) {
      throw new Error(`${name} no tiene Binance ID cargado`);
    }
    if (item.serviceCutIds.length === 0) {
      throw new Error(`${name} no tiene ninguna run pendiente incluida`);
    }

    let rawAmount = 0;
    for (const cutId of item.serviceCutIds) {
      const cut = cutsById.get(cutId);
      if (!cut) throw new Error("Una de las runs seleccionadas ya no existe -- recarga e intenta de nuevo");
      const belongsToItem = isFreelance ? cut.freelancer_id === item.freelancerId : cut.user_id === item.userId;
      if (!belongsToItem) {
        throw new Error("Una run seleccionada no le pertenece al booster indicado");
      }
      if (cut.paid) {
        throw new Error(`${name} ya tiene esa run pagada -- recarga e intenta de nuevo`);
      }
      rawAmount = floorToCents(rawAmount + Number(cut.cut_amount));
    }

    const available = isFreelance ? 0 : (remainingDiscountByUser.get(item.userId as string) ?? 0);
    const discountApplied = floorToCents(Math.min(rawAmount, available));
    if (!isFreelance) remainingDiscountByUser.set(item.userId as string, floorToCents(available - discountApplied));

    return {
      user_id: item.userId,
      freelancer_id: item.freelancerId,
      discord_username: name,
      binance_id: binanceId,
      amount: floorToCents(rawAmount - discountApplied),
      discount_applied: discountApplied,
      service_cut_ids: item.serviceCutIds,
      status: "pending" as const,
    };
  });

  const { data: batch, error: batchError } = await supabase
    .from("payout_batches")
    .insert({ currency: input.currency, note: input.note || null, created_by: createdBy })
    .select("id, currency, note, created_by, created_at")
    .single();
  raise(batchError);

  const { data: insertedItems, error: itemsError } = await supabase
    .from("payout_batch_items")
    .insert(itemRows.map((row) => ({ ...row, batch_id: batch.id })))
    .select("*");
  raise(itemsError);

  return toPayoutBatch(batch, insertedItems ?? []);
}

async function maybeCompleteRun(supabase: SupabaseClient, serviceId: string): Promise<void> {
  const { data: cuts } = await supabase
    .from("service_cuts")
    .select("paid, user_id, freelancer_id")
    .eq("service_id", serviceId);
  const payableCuts = (cuts ?? []).filter((c) => c.user_id !== null || c.freelancer_id !== null);
  if (payableCuts.length === 0) return;
  if (!payableCuts.every((c) => c.paid === true)) return;

  await supabase
    .from("services_sold")
    .update({ fully_paid: true, paid_at: new Date().toISOString() })
    .eq("id", serviceId)
    .eq("fully_paid", false);
}

async function settlePaidCuts(supabase: SupabaseClient, cutIds: string[], userId: string | null): Promise<void> {
  if (cutIds.length === 0) return;

  const { data: cutRows, error: cutsError } = await supabase
    .from("service_cuts")
    .select("id, service_id, cut_amount")
    .in("id", cutIds);
  raise(cutsError);

  const { error: updateError } = await supabase
    .from("service_cuts")
    .update({ paid: true, paid_date: new Date().toISOString().slice(0, 10) })
    .in("id", cutIds);
  raise(updateError);

  const serviceIds = Array.from(new Set((cutRows ?? []).map((r) => r.service_id as string)));

  const totalByRun = new Map<string, number>();
  for (const row of cutRows ?? []) {
    const serviceId = row.service_id as string;
    totalByRun.set(serviceId, (totalByRun.get(serviceId) ?? 0) + Number(row.cut_amount));
  }

  await notifyPaymentSummary(
    {
      userId,
      runCount: totalByRun.size,
      totalAmount: floorToCents(Array.from(totalByRun.values()).reduce((sum, v) => sum + v, 0)),
    },
    supabase
  ).catch(() => {});

  for (const serviceId of serviceIds) {
    await maybeCompleteRun(supabase, serviceId);
  }
}

async function revertPaidCuts(supabase: SupabaseClient, cutIds: string[]): Promise<void> {
  if (cutIds.length === 0) return;

  const { data: cutRows, error: cutsError } = await supabase
    .from("service_cuts")
    .select("id, service_id")
    .in("id", cutIds);
  raise(cutsError);

  const { error: updateError } = await supabase.from("service_cuts").update({ paid: false, paid_date: null }).in("id", cutIds);
  raise(updateError);

  const serviceIds = Array.from(new Set((cutRows ?? []).map((r) => r.service_id as string)));
  if (serviceIds.length > 0) {
    await supabase
      .from("services_sold")
      .update({ fully_paid: false, paid_at: null })
      .in("id", serviceIds)
      .eq("fully_paid", true);
  }
}

export interface MarkPaidOptions {
  txReference: string | null;
  paidBy: string | null;
}

export async function markPayoutItemPaid(
  supabase: SupabaseClient,
  itemId: string,
  options: MarkPaidOptions
): Promise<PayoutBatchItem> {
  const { data: item, error } = await supabase.from("payout_batch_items").select("*").eq("id", itemId).maybeSingle();
  raise(error);
  if (!item) throw new Error("Ítem de pago no encontrado");
  if (item.status === "paid") return toPayoutBatchItem(item);
  if (!item.user_id && !item.freelancer_id) {
    throw new Error("No se puede confirmar el pago: el booster ya no existe");
  }

  await settlePaidCuts(supabase, (item.service_cut_ids as string[]) ?? [], (item.user_id as string | null) ?? null);

  const { data: updated, error: updateError } = await supabase
    .from("payout_batch_items")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      paid_by: options.paidBy,
      tx_reference: options.txReference || null,
    })
    .eq("id", itemId)
    .select("*")
    .single();
  raise(updateError);

  return toPayoutBatchItem(updated);
}

export async function markPayoutBatchPaid(
  supabase: SupabaseClient,
  batchId: string,
  options: MarkPaidOptions
): Promise<PayoutBatchItem[]> {
  const { data: items, error } = await supabase
    .from("payout_batch_items")
    .select("id, status")
    .eq("batch_id", batchId);
  raise(error);

  const pendingItems = (items ?? []).filter((i: Row) => i.status === "pending");
  const results: PayoutBatchItem[] = [];
  for (const item of pendingItems) {
    results.push(await markPayoutItemPaid(supabase, item.id as string, options));
  }
  return results;
}

export async function unmarkPayoutItemPaid(supabase: SupabaseClient, itemId: string): Promise<PayoutBatchItem> {
  const { data: item, error } = await supabase.from("payout_batch_items").select("*").eq("id", itemId).maybeSingle();
  raise(error);
  if (!item) throw new Error("Ítem de pago no encontrado");
  if (item.status !== "paid") return toPayoutBatchItem(item);

  await revertPaidCuts(supabase, (item.service_cut_ids as string[]) ?? []);

  const { data: updated, error: updateError } = await supabase
    .from("payout_batch_items")
    .update({ status: "pending", paid_at: null, paid_by: null, tx_reference: null })
    .eq("id", itemId)
    .select("*")
    .single();
  raise(updateError);

  return toPayoutBatchItem(updated);
}

export async function listPayoutBatches(supabase: SupabaseClient): Promise<PayoutBatch[]> {
  const [batchesResult, itemsResult] = await Promise.all([
    supabase.from("payout_batches").select("*").order("created_at", { ascending: false }),
    supabase.from("payout_batch_items").select("*"),
  ]);
  raise(batchesResult.error);
  raise(itemsResult.error);

  const itemsByBatch = new Map<string, Row[]>();
  for (const item of itemsResult.data ?? []) {
    const batchId = item.batch_id as string;
    if (!itemsByBatch.has(batchId)) itemsByBatch.set(batchId, []);
    itemsByBatch.get(batchId)!.push(item);
  }

  return (batchesResult.data ?? []).map((batch: Row) => toPayoutBatch(batch, itemsByBatch.get(batch.id as string) ?? []));
}

export async function deletePayoutBatch(supabase: SupabaseClient, batchId: string): Promise<void> {
  const { data: items, error } = await supabase
    .from("payout_batch_items")
    .select("id, status")
    .eq("batch_id", batchId);
  raise(error);

  if ((items ?? []).some((i: Row) => i.status === "paid")) {
    throw new Error("Este lote tiene pagos ya confirmados -- deshazlos primero antes de eliminarlo");
  }

  const { error: deleteItemsError } = await supabase.from("payout_batch_items").delete().eq("batch_id", batchId);
  raise(deleteItemsError);

  const { error: deleteError } = await supabase.from("payout_batches").delete().eq("id", batchId);
  raise(deleteError);
}
