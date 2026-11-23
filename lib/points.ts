import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getLockoutWeekStart } from "@/lib/wow-reset";
import { getFriendUserIds } from "@/lib/friend-members";
import { getRemovedUserIds } from "@/lib/removed-members";

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

export const EVIDENCE_BUCKET = "puntos-evidencia";
const SIGNED_URL_TTL_SECONDS = 300;

export const DEFAULT_POINT_PERCENT = 10;

export type PointScope = "week" | "run";

export type AppealStatus = "pending" | "approved" | "denied";

export interface GuildPointRow {
  id: string;
  userId: string;
  points: number;
  percent: number;
  scope: PointScope;
  reason: string | null;
  wclReportCode: string | null;
  wclFightId: number | null;
  wclBossName: string | null;
  wclKill: boolean | null;
  wclStartTime: string | null;
  hasEvidence: boolean;
  evidenceUrl: string | null;
  weekStart: string;
  createdAt: string;
  reverted: boolean;
  revertedAt: string | null;
  appealStatus: AppealStatus | null;
}

export interface PointsTotals {
  totalPoints: number;
  totalPercentValue: number;
}

export interface ScopedTotals {
  week: PointsTotals;
  run: PointsTotals;
}

export interface PointsWeekGroup {
  weekStart: string;
  rows: GuildPointRow[];
  total: PointsTotals;
  scoped: ScopedTotals;
}

interface RawPointRow {
  id: string;
  user_id: string;
  points: number;
  percent: number | string;
  scope: PointScope;
  reason: string | null;
  wcl_report_code: string | null;
  wcl_fight_id: number | null;
  wcl_boss_name: string | null;
  wcl_kill: boolean | null;
  wcl_start_time: string | null;
  evidence_path: string | null;
  week_start: string;
  created_at: string;
  reverted: boolean | null;
  reverted_at: string | null;
}

const POINT_COLUMNS =
  "id, user_id, points, percent, scope, reason, wcl_report_code, wcl_fight_id, wcl_boss_name, wcl_kill, wcl_start_time, evidence_path, week_start, created_at, reverted, reverted_at";

function weekKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function getCurrentPointsWeek(): string {
  return weekKey(getLockoutWeekStart("us"));
}

export function shiftPointsWeek(weekStart: string, deltaWeeks: number): string {
  const d = new Date(`${weekStart}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaWeeks * 7);
  return weekKey(d);
}

function percentValueOf(points: number, percent: number): number {
  return Math.round(points * percent * 100) / 100;
}

function totalsOf(rows: GuildPointRow[]): PointsTotals {
  let totalPoints = 0;
  let totalPercentValue = 0;
  for (const row of rows) {
    if (row.reverted) continue;
    totalPoints += row.points;
    totalPercentValue += percentValueOf(row.points, row.percent);
  }
  return { totalPoints, totalPercentValue: Math.round(totalPercentValue * 100) / 100 };
}

function scopedTotalsOf(rows: GuildPointRow[]): ScopedTotals {
  return {
    week: totalsOf(rows.filter((r) => r.scope === "week")),
    run: totalsOf(rows.filter((r) => r.scope === "run")),
  };
}

export function scopedTotalsFromRows(rows: GuildPointRow[]): ScopedTotals {
  return scopedTotalsOf(rows);
}

async function signEvidencePaths(
  supabase: SupabaseClient,
  paths: string[]
): Promise<Map<string, string>> {
  const signed = new Map<string, string>();
  const unique = Array.from(new Set(paths));
  if (unique.length === 0) return signed;

  const { data, error } = await supabase.storage
    .from(EVIDENCE_BUCKET)
    .createSignedUrls(unique, SIGNED_URL_TTL_SECONDS);

  if (error) {
    console.error("Error firmando capturas de Puntos:", error.message);
    return signed;
  }

  for (const entry of data ?? []) {
    if (entry.path && entry.signedUrl) signed.set(entry.path, entry.signedUrl);
  }
  return signed;
}

async function fetchAppealStatuses(
  supabase: SupabaseClient,
  pointIds: string[]
): Promise<Map<string, AppealStatus>> {
  const byPoint = new Map<string, AppealStatus>();
  const unique = Array.from(new Set(pointIds));
  if (unique.length === 0) return byPoint;

  const { data, error } = await supabase
    .from("point_appeals")
    .select("point_id, status, created_at")
    .in("point_id", unique)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error leyendo las apelaciones de los puntos:", error.message);
    return byPoint;
  }

  for (const row of data ?? []) {
    const pointId = row.point_id as string;
    if (!byPoint.has(pointId)) byPoint.set(pointId, row.status as AppealStatus);
  }
  return byPoint;
}

async function toPointRows(
  supabase: SupabaseClient,
  raw: RawPointRow[]
): Promise<GuildPointRow[]> {
  const [signed, appeals] = await Promise.all([
    signEvidencePaths(
      supabase,
      raw.map((r) => r.evidence_path).filter((p): p is string => Boolean(p))
    ),
    fetchAppealStatuses(
      supabase,
      raw.map((r) => r.id)
    ),
  ]);

  return raw.map((r) => ({
    id: r.id,
    userId: r.user_id,
    points: r.points,
    percent: Number(r.percent),
    scope: r.scope,
    reason: r.reason,
    wclReportCode: r.wcl_report_code,
    wclFightId: r.wcl_fight_id,
    wclBossName: r.wcl_boss_name,
    wclKill: r.wcl_kill,
    wclStartTime: r.wcl_start_time,
    hasEvidence: Boolean(r.evidence_path),
    evidenceUrl: r.evidence_path ? (signed.get(r.evidence_path) ?? null) : null,
    weekStart: r.week_start,
    createdAt: r.created_at,
    reverted: Boolean(r.reverted),
    revertedAt: r.reverted_at,
    appealStatus: appeals.get(r.id) ?? null,
  }));
}

function groupByWeek(rows: GuildPointRow[]): PointsWeekGroup[] {
  const byWeek = new Map<string, GuildPointRow[]>();
  for (const row of rows) {
    const list = byWeek.get(row.weekStart) ?? [];
    list.push(row);
    byWeek.set(row.weekStart, list);
  }

  return Array.from(byWeek.entries())
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([weekStart, weekRows]) => ({
      weekStart,
      rows: weekRows,
      total: totalsOf(weekRows),
      scoped: scopedTotalsOf(weekRows),
    }));
}

export function totalsFromRows(rows: GuildPointRow[]): PointsTotals {
  return totalsOf(rows);
}

export async function getUserPointsHistory(
  supabase: SupabaseClient,
  userId: string
): Promise<PointsWeekGroup[]> {
  const { data, error } = await supabase
    .from("guild_points")
    .select(POINT_COLUMNS)
    .eq("user_id", userId)
    .order("week_start", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error leyendo guild_points del miembro:", error.message);
    return [];
  }

  return groupByWeek(await toPointRows(supabase, (data ?? []) as RawPointRow[]));
}

export interface GuildPointsWeekSnapshot {
  weekStart: string;
  rows: GuildPointRow[];
  totalsByUser: Record<string, ScopedTotals>;
}

export async function getGuildPointsWeekSnapshot(
  supabase: SupabaseClient,
  weekStart: string
): Promise<GuildPointsWeekSnapshot> {
  const [{ data, error }, excludedIds] = await Promise.all([
    supabase
      .from("guild_points")
      .select(POINT_COLUMNS)
      .eq("week_start", weekStart)
      .order("created_at", { ascending: false }),
    getExcludedUserIds(supabase),
  ]);

  if (error) {
    console.error("Error leyendo la semana de guild_points:", error.message);
    return { weekStart, rows: [], totalsByUser: {} };
  }

  const visible = ((data ?? []) as RawPointRow[]).filter((r) => !excludedIds.has(r.user_id));
  const rows = await toPointRows(supabase, visible);

  const byUser = new Map<string, GuildPointRow[]>();
  for (const row of rows) {
    const list = byUser.get(row.userId) ?? [];
    list.push(row);
    byUser.set(row.userId, list);
  }
  const totalsByUser: Record<string, ScopedTotals> = {};
  for (const [userId, userRows] of byUser) {
    totalsByUser[userId] = scopedTotalsOf(userRows);
  }

  return { weekStart, rows, totalsByUser };
}

export async function getGuildCurrentWeekPoints(
  supabase: SupabaseClient
): Promise<Map<string, ScopedTotals>> {
  const snapshot = await getGuildPointsWeekSnapshot(supabase, getCurrentPointsWeek());
  return new Map(Object.entries(snapshot.totalsByUser));
}

export async function getUserCurrentWeekPoints(
  supabase: SupabaseClient,
  userId: string
): Promise<PointsTotals> {
  const { data, error } = await supabase
    .from("guild_points")
    .select("points, percent")
    .eq("user_id", userId)
    .eq("week_start", getCurrentPointsWeek())
    .eq("reverted", false);

  if (error) {
    console.error("Error leyendo los puntos de la semana:", error.message);
    return { totalPoints: 0, totalPercentValue: 0 };
  }

  let totalPoints = 0;
  let totalPercentValue = 0;
  for (const row of data ?? []) {
    totalPoints += Number(row.points);
    totalPercentValue += percentValueOf(Number(row.points), Number(row.percent));
  }
  return { totalPoints, totalPercentValue: Math.round(totalPercentValue * 100) / 100 };
}

export async function getExcludedUserIds(supabase: SupabaseClient): Promise<Set<string>> {
  const [removed, friends] = await Promise.all([
    getRemovedUserIds(supabase),
    getFriendUserIds(supabase),
  ]);
  return new Set([...removed, ...friends]);
}

export interface EligibleMember {
  id: string;
  name: string;
  avatarUrl: string | null;
}

export async function getPointEligibleMembers(
  supabase: SupabaseClient
): Promise<EligibleMember[]> {
  const { data, error } = await supabase
    .from("app_users")
    .select("id, discord_username, nickname, avatar_url, app_role, removed_at")
    .order("discord_username");

  if (error) {
    console.error("Error leyendo los miembros elegibles de Puntos:", error.message);
    return [];
  }

  return (data ?? [])
    .filter(
      (m) => !m.removed_at && m.app_role !== "friend" && m.app_role !== "guest"
    )
    .map((m) => ({
      id: m.id as string,
      name: (m.nickname ?? m.discord_username) as string,
      avatarUrl: (m.avatar_url as string | null) ?? null,
    }));
}

export async function getDiscordIdsByUserId(
  supabase: SupabaseClient,
  userIds: string[]
): Promise<Map<string, string | null>> {
  if (userIds.length === 0) return new Map();

  const { data, error } = await supabase.from("app_users").select("id, discord_id").in("id", userIds);

  if (error) {
    console.error("Error leyendo discord_id de los miembros:", error.message);
    return new Map();
  }

  return new Map((data ?? []).map((u) => [u.id as string, (u.discord_id as string | null) ?? null]));
}

export interface CreatePointInput {
  userId: string;
  createdBy: string | null;
  scope: PointScope;
  points: number;
  percent: number;
  reason: string | null;
  wclReportCode?: string | null;
  wclFightId?: number | null;
  wclBossName?: string | null;
  wclKill?: boolean | null;
  wclStartTime?: string | null;
  weekStart?: string;
}

export class PointValidationError extends Error {}

function validateTargetWeek(weekStart: string): void {
  const current = getCurrentPointsWeek();
  const diffDays =
    (new Date(`${weekStart}T00:00:00Z`).getTime() - new Date(`${current}T00:00:00Z`).getTime()) / 86_400_000;

  if (!Number.isInteger(diffDays) || diffDays % 7 !== 0) {
    throw new PointValidationError("La semana elegida no es válida.");
  }
  if (diffDays < 0) {
    throw new PointValidationError("No se puede cargar un punto en una semana que ya pasó.");
  }
}

export async function createPoint(
  supabase: SupabaseClient,
  input: CreatePointInput
): Promise<GuildPointRow> {
  if (!Number.isInteger(input.points) || input.points <= 0) {
    throw new PointValidationError("La cantidad de puntos tiene que ser un entero mayor que 0.");
  }
  if (!Number.isFinite(input.percent) || input.percent <= 0) {
    throw new PointValidationError("El porcentaje de descuento tiene que ser mayor que 0.");
  }
  if (input.scope !== "week" && input.scope !== "run") {
    throw new PointValidationError("El tipo de punto no es válido.");
  }
  if (input.scope === "run" && !input.wclReportCode) {
    throw new PointValidationError("Un punto de tipo \"Run específica\" necesita su link de Warcraft Logs.");
  }

  const weekStart = input.weekStart ?? getCurrentPointsWeek();
  validateTargetWeek(weekStart);

  const { data, error } = await supabase
    .from("guild_points")
    .insert({
      user_id: input.userId,
      created_by: input.createdBy,
      points: input.points,
      percent: input.percent,
      scope: input.scope,
      reason: input.reason,
      wcl_report_code: input.wclReportCode ?? null,
      wcl_fight_id: input.wclFightId ?? null,
      wcl_boss_name: input.wclBossName ?? null,
      wcl_kill: input.wclKill ?? null,
      wcl_start_time: input.wclStartTime ?? null,
      week_start: weekStart,
    })
    .select(POINT_COLUMNS)
    .single();

  if (error) throw new Error(error.message);

  const [row] = await toPointRows(supabase, [data as RawPointRow]);
  return row;
}

export interface UpdatePointInput {
  scope: PointScope;
  points: number;
  percent: number;
  reason: string | null;
  wclReportCode?: string | null;
  wclFightId?: number | null;
  wclBossName?: string | null;
  wclKill?: boolean | null;
  wclStartTime?: string | null;
}

export async function updatePoint(
  supabase: SupabaseClient,
  pointId: string,
  input: UpdatePointInput
): Promise<GuildPointRow> {
  if (!Number.isInteger(input.points) || input.points <= 0) {
    throw new PointValidationError("La cantidad de puntos tiene que ser un entero mayor que 0.");
  }
  if (!Number.isFinite(input.percent) || input.percent <= 0) {
    throw new PointValidationError("El porcentaje de descuento tiene que ser mayor que 0.");
  }
  if (input.scope !== "week" && input.scope !== "run") {
    throw new PointValidationError("El tipo de punto no es válido.");
  }
  if (input.scope === "run" && !input.wclReportCode) {
    throw new PointValidationError("Un punto de tipo \"Run específica\" necesita su link de Warcraft Logs.");
  }

  const { data: existing, error: readError } = await supabase
    .from("guild_points")
    .select("id, reverted")
    .eq("id", pointId)
    .maybeSingle();
  if (readError) throw new Error(readError.message);
  if (!existing) {
    throw new PointValidationError("Ese punto ya no existe.");
  }
  if (existing.reverted) {
    throw new PointValidationError("Ese punto ya fue revertido por una apelación, no se puede editar.");
  }

  const { data: pendingAppeal, error: appealError } = await supabase
    .from("point_appeals")
    .select("id")
    .eq("point_id", pointId)
    .eq("status", "pending")
    .maybeSingle();
  if (appealError) throw new Error(appealError.message);
  if (pendingAppeal) {
    throw new PointValidationError("Ese punto tiene una apelación pendiente -- resuélvela antes de editarlo.");
  }

  const { data, error } = await supabase
    .from("guild_points")
    .update({
      points: input.points,
      percent: input.percent,
      scope: input.scope,
      reason: input.reason,
      wcl_report_code: input.wclReportCode ?? null,
      wcl_fight_id: input.wclFightId ?? null,
      wcl_boss_name: input.wclBossName ?? null,
      wcl_kill: input.wclKill ?? null,
      wcl_start_time: input.wclStartTime ?? null,
    })
    .eq("id", pointId)
    .select(POINT_COLUMNS)
    .single();

  if (error) throw new Error(error.message);

  const [row] = await toPointRows(supabase, [data as RawPointRow]);
  return row;
}

export async function attachEvidence(
  supabase: SupabaseClient,
  pointId: string,
  evidencePath: string
): Promise<void> {
  const { error } = await supabase
    .from("guild_points")
    .update({ evidence_path: evidencePath })
    .eq("id", pointId);
  if (error) throw new Error(error.message);
}

export async function getSignedEvidenceUrl(
  supabase: SupabaseClient,
  path: string
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(EVIDENCE_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error) {
    console.error("Error firmando la captura de un punto:", error.message);
    return null;
  }
  return data?.signedUrl ?? null;
}

export class PointAppealError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

export interface PointAppeal {
  id: string;
  pointId: string;
  requesterId: string;
  reason: string;
  status: AppealStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

const APPEAL_COLUMNS =
  "id, point_id, requester_id, reason, status, reviewed_by, reviewed_at, created_at";

interface RawAppealRow {
  id: string;
  point_id: string;
  requester_id: string;
  reason: string;
  status: AppealStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

function toAppeal(raw: RawAppealRow): PointAppeal {
  return {
    id: raw.id,
    pointId: raw.point_id,
    requesterId: raw.requester_id,
    reason: raw.reason,
    status: raw.status,
    reviewedBy: raw.reviewed_by,
    reviewedAt: raw.reviewed_at,
    createdAt: raw.created_at,
  };
}

export function describePoint(row: GuildPointRow): string {
  if (row.reason) return row.reason;
  if (row.scope === "run" && row.wclBossName) return `Run contra ${row.wclBossName}`;
  return "Sin motivo anotado";
}

export interface CreateAppealInput {
  pointId: string;
  requesterId: string;
  reason: string;
}

export async function createAppeal(
  supabase: SupabaseClient,
  input: CreateAppealInput
): Promise<PointAppeal> {
  const reason = input.reason.trim();
  if (!reason) {
    throw new PointAppealError("Escribe por qué apelas este punto.", 400);
  }

  const { data: point, error: pointError } = await supabase
    .from("guild_points")
    .select("id, user_id, reverted")
    .eq("id", input.pointId)
    .maybeSingle();

  if (pointError) throw new Error(pointError.message);
  if (!point) {
    throw new PointAppealError("Ese punto ya no existe.", 404);
  }
  if (point.user_id !== input.requesterId) {
    throw new PointAppealError("Solo puedes apelar un punto que se te cargó a ti.", 403);
  }
  if (point.reverted) {
    throw new PointAppealError("Ese punto ya fue revertido, no hace falta apelarlo.", 409);
  }

  const { data: open, error: openError } = await supabase
    .from("point_appeals")
    .select("id")
    .eq("point_id", input.pointId)
    .eq("status", "pending")
    .maybeSingle();

  if (openError) throw new Error(openError.message);
  if (open) {
    throw new PointAppealError("Ya tienes una apelación en revisión para ese punto.", 409);
  }

  const { data, error } = await supabase
    .from("point_appeals")
    .insert({
      point_id: input.pointId,
      requester_id: input.requesterId,
      reason,
      status: "pending",
    })
    .select(APPEAL_COLUMNS)
    .single();

  if (error) throw new Error(error.message);
  return toAppeal(data as RawAppealRow);
}

export interface PendingAppeal {
  id: string;
  reason: string;
  createdAt: string;
  requesterId: string;
  requesterName: string;
  requesterAvatarUrl: string | null;
  point: GuildPointRow;
}

export async function getPendingAppeals(supabase: SupabaseClient): Promise<PendingAppeal[]> {
  const { data, error } = await supabase
    .from("point_appeals")
    .select(APPEAL_COLUMNS)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error leyendo la cola de apelaciones:", error.message);
    return [];
  }

  const appeals = (data ?? []) as RawAppealRow[];
  if (appeals.length === 0) return [];

  const [pointsResult, usersResult] = await Promise.all([
    supabase
      .from("guild_points")
      .select(POINT_COLUMNS)
      .in("id", Array.from(new Set(appeals.map((a) => a.point_id)))),
    supabase
      .from("app_users")
      .select("id, discord_username, nickname, avatar_url")
      .in("id", Array.from(new Set(appeals.map((a) => a.requester_id)))),
  ]);

  if (pointsResult.error) {
    console.error("Error leyendo los puntos apelados:", pointsResult.error.message);
    return [];
  }

  const rows = await toPointRows(supabase, (pointsResult.data ?? []) as RawPointRow[]);
  const pointById = new Map(rows.map((r) => [r.id, r]));
  const userById = new Map(
    (usersResult.data ?? []).map((u) => [
      u.id as string,
      {
        name: (u.nickname ?? u.discord_username) as string,
        avatarUrl: (u.avatar_url as string | null) ?? null,
      },
    ])
  );

  return appeals.flatMap((appeal) => {
    const point = pointById.get(appeal.point_id);
    if (!point) return [];
    const user = userById.get(appeal.requester_id);
    return [
      {
        id: appeal.id,
        reason: appeal.reason,
        createdAt: appeal.created_at,
        requesterId: appeal.requester_id,
        requesterName: user?.name ?? "Miembro",
        requesterAvatarUrl: user?.avatarUrl ?? null,
        point,
      },
    ];
  });
}

export interface ResolveAppealInput {
  appealId: string;
  approve: boolean;
  reviewedBy: string | null;
}

export interface ResolvedAppeal {
  appeal: PointAppeal;
  point: GuildPointRow;
  ownerName: string;
  ownerDiscordId: string | null;
}

export async function resolveAppeal(
  supabase: SupabaseClient,
  input: ResolveAppealInput
): Promise<ResolvedAppeal> {
  const { data: existing, error: readError } = await supabase
    .from("point_appeals")
    .select(APPEAL_COLUMNS)
    .eq("id", input.appealId)
    .maybeSingle();

  if (readError) throw new Error(readError.message);
  if (!existing) {
    throw new PointAppealError("Esa apelación ya no existe.", 404);
  }

  const appeal = toAppeal(existing as RawAppealRow);
  if (appeal.status !== "pending") {
    throw new PointAppealError("Esa apelación ya fue resuelta.", 409);
  }

  const now = new Date().toISOString();
  const { data: updated, error: updateError } = await supabase
    .from("point_appeals")
    .update({
      status: input.approve ? "approved" : "denied",
      reviewed_by: input.reviewedBy,
      reviewed_at: now,
    })
    .eq("id", input.appealId)
    .select(APPEAL_COLUMNS)
    .single();

  if (updateError) throw new Error(updateError.message);

  if (input.approve) {
    const { error: revertError } = await supabase
      .from("guild_points")
      .update({ reverted: true, reverted_at: now })
      .eq("id", appeal.pointId);
    if (revertError) throw new Error(revertError.message);
  }

  const { data: pointData, error: pointError } = await supabase
    .from("guild_points")
    .select(POINT_COLUMNS)
    .eq("id", appeal.pointId)
    .maybeSingle();

  if (pointError) throw new Error(pointError.message);
  if (!pointData) {
    throw new PointAppealError("El punto de esa apelación ya no existe.", 404);
  }

  const [point] = await toPointRows(supabase, [pointData as RawPointRow]);

  const { data: owner } = await supabase
    .from("app_users")
    .select("discord_username, nickname, discord_id")
    .eq("id", appeal.requesterId)
    .maybeSingle();

  return {
    appeal: toAppeal(updated as RawAppealRow),
    point,
    ownerName: ((owner?.nickname ?? owner?.discord_username) as string) ?? "Miembro",
    ownerDiscordId: (owner?.discord_id as string | null) ?? null,
  };
}
