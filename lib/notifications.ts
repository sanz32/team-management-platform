import { createServerSupabaseClient } from "./supabase-server";
import { formatRosterTitle, RosterContentSummary } from "./roster-title";
import { formatDayLabel, formatPointsWeekLabel } from "./format";
import { getCurrentRaidCatalog } from "./raid-catalog";
import { getCurrentPointsWeek } from "./points";

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

interface NotifyRosterSelectionParams {
  rosterId: string;
  scheduledFor: string;
  content: RosterContentSummary | null | undefined;
  userIds: (string | null | undefined)[];
}

export async function notifyRosterSelection({
  rosterId,
  scheduledFor,
  content,
  userIds,
}: NotifyRosterSelectionParams): Promise<void> {
  const uniqueUserIds = Array.from(new Set(userIds.filter((id): id is string => Boolean(id))));
  if (uniqueUserIds.length === 0) return;

  const supabase = createServerSupabaseClient();
  const { raids } = await getCurrentRaidCatalog(supabase);
  const title = formatRosterTitle(scheduledFor, content, raids);
  const message = `Uno de tus personajes fue elegido para el ${title}. Échale un vistazo.`;
  const rows = uniqueUserIds.map((user_id) => ({
    user_id,
    type: "roster_selected",
    roster_id: rosterId,
    message,
  }));

  const { error } = await supabase.from("notifications").insert(rows);
  if (error) {
    console.error("Error creando notificaciones de roster:", error);
  }
}

interface NotifyPaymentSummaryParams {
  userId: string | null;
  runCount: number;
  totalAmount: number;
}

export async function notifyPaymentSummary(
  { userId, runCount, totalAmount }: NotifyPaymentSummaryParams,
  supabase: SupabaseClient = createServerSupabaseClient()
): Promise<void> {
  if (!userId || runCount === 0) return;

  const amount = `$${Number(totalAmount).toFixed(2)}`;
  const message =
    runCount === 1
      ? `Se te pagó ${amount} por 1 run OB.`
      : `Se te pagaron ${amount} por ${runCount} runs OB.`;

  const { error } = await supabase
    .from("notifications")
    .insert({ user_id: userId, type: "payment", roster_id: null, message });
  if (error) {
    console.error("Error creando la notificación de pago:", error);
  }
}

interface NotifyObDiscountParams {
  userId: string;
  amount: number;
  reason: string | null;
}

export async function notifyObDiscount(
  { userId, amount, reason }: NotifyObDiscountParams,
  supabase: SupabaseClient = createServerSupabaseClient()
): Promise<void> {
  const suffix = reason ? ` Motivo: ${reason}.` : "";
  const message = `Se aplicó un descuento de $${Number(amount).toFixed(2)} a tu balance de Runs OB.${suffix}`;

  const { error } = await supabase
    .from("notifications")
    .insert({ user_id: userId, type: "ob_discount", roster_id: null, message });
  if (error) {
    console.error("Error creando la notificación de descuento:", error);
  }
}

interface NotifyPointAssignedParams {
  userId: string;
  points: number;
  scope: "week" | "run";
  reason: string | null;
  bossName: string | null;
  kill: boolean | null;
  weekStart: string;
}

function describePointCause(
  scope: "week" | "run",
  bossName: string | null,
  kill: boolean | null,
  reason: string | null
): string | null {
  if (scope === "run" && bossName) {
    const resultado = kill === null ? "" : kill ? " (Kill)" : " (Wipe)";
    return `en la run contra ${bossName}${resultado}`;
  }
  if (reason) return `por: ${reason}`;
  return null;
}

export async function notifyPointAssigned(
  { userId, points, scope, reason, bossName, kill, weekStart }: NotifyPointAssignedParams,
  supabase: SupabaseClient = createServerSupabaseClient()
): Promise<void> {
  const cantidad = points === 1 ? "1 punto" : `${points} puntos`;
  const cause = describePointCause(scope, bossName, kill, reason);
  const isFutureWeek = weekStart > getCurrentPointsWeek();

  let message: string;
  if (isFutureWeek) {
    const weekLabel = formatPointsWeekLabel(weekStart);
    const weekPhrase = weekLabel.charAt(0).toLowerCase() + weekLabel.slice(1);
    message = cause
      ? `Vas a tener ${cantidad} en la ${weekPhrase} ${cause}.`
      : `Vas a tener ${cantidad} en la ${weekPhrase}.`;
  } else {
    const verbo = points === 1 ? "Se te cargó" : "Se te cargaron";
    message = cause
      ? scope === "run"
        ? `${verbo} ${cantidad} ${cause}.`
        : `${verbo} ${cantidad} esta semana ${cause}.`
      : `${verbo} ${cantidad} esta semana.`;
  }

  const { error } = await supabase
    .from("notifications")
    .insert({ user_id: userId, type: "point_assigned", roster_id: null, message });
  if (error) {
    console.error("Error creando la notificación de punto:", error);
  }
}

export async function notifyPointAppealDecision(
  userId: string,
  approved: boolean,
  pointDescription: string,
  supabase: SupabaseClient = createServerSupabaseClient()
): Promise<void> {
  const message = approved
    ? `Tu apelación fue aprobada: el punto por '${pointDescription}' ya no cuenta en tu descuento.`
    : `Tu apelación fue rechazada: el punto por '${pointDescription}' se mantiene.`;

  const { error } = await supabase
    .from("notifications")
    .insert({ user_id: userId, type: "point_appeal_decision", roster_id: null, message });
  if (error) {
    console.error("Error creando la notificación de apelación:", error);
  }
}

interface NotifySwapRequestParams {
  recipientId: string;
  requesterName: string;
  requesterDate: string;
  recipientDate: string;
}

export async function notifySwapRequest({
  recipientId,
  requesterName,
  requesterDate,
  recipientDate,
}: NotifySwapRequestParams): Promise<void> {
  const supabase = createServerSupabaseClient();
  const message = `${requesterName} quiere intercambiar tu día libre del ${formatDayLabel(
    recipientDate
  )} por el suyo del ${formatDayLabel(requesterDate)}.`;

  const { error } = await supabase
    .from("notifications")
    .insert({ user_id: recipientId, type: "swap_request", roster_id: null, message });
  if (error) {
    console.error("Error creando notificación de solicitud de intercambio:", error);
  }
}

interface NotifySwapResponseParams {
  requesterId: string;
  recipientName: string;
  accepted: boolean;
  requesterDate: string;
  recipientDate: string;
}

export async function notifySwapResponse({
  requesterId,
  recipientName,
  accepted,
  requesterDate,
  recipientDate,
}: NotifySwapResponseParams): Promise<void> {
  const supabase = createServerSupabaseClient();
  const message = accepted
    ? `${recipientName} aceptó tu intercambio del ${formatDayLabel(requesterDate)} por el ${formatDayLabel(recipientDate)}. Falta que un RL lo apruebe.`
    : `${recipientName} rechazó tu solicitud de intercambiar el ${formatDayLabel(requesterDate)} por el ${formatDayLabel(recipientDate)}.`;

  const { error } = await supabase
    .from("notifications")
    .insert({ user_id: requesterId, type: "swap_response", roster_id: null, message });
  if (error) {
    console.error("Error creando notificación de respuesta de intercambio:", error);
  }
}

interface NotifySwapDecisionParams {
  requesterId: string;
  recipientId: string;
  reviewerName: string;
  approved: boolean;
  requesterDate: string;
  recipientDate: string;
}

export async function notifySwapDecision({
  requesterId,
  recipientId,
  reviewerName,
  approved,
  requesterDate,
  recipientDate,
}: NotifySwapDecisionParams): Promise<void> {
  const supabase = createServerSupabaseClient();

  const rows = approved
    ? [
        {
          user_id: requesterId,
          message: `${reviewerName} aprobó tu intercambio: ahora tienes libre el ${formatDayLabel(recipientDate)} en vez del ${formatDayLabel(requesterDate)}.`,
        },
        {
          user_id: recipientId,
          message: `${reviewerName} aprobó tu intercambio: ahora tienes libre el ${formatDayLabel(requesterDate)} en vez del ${formatDayLabel(recipientDate)}.`,
        },
      ]
    : [
        {
          user_id: requesterId,
          message: `${reviewerName} no aprobó el intercambio: conservas tu día libre del ${formatDayLabel(requesterDate)}.`,
        },
        {
          user_id: recipientId,
          message: `${reviewerName} no aprobó el intercambio: conservas tu día libre del ${formatDayLabel(recipientDate)}.`,
        },
      ];

  const { error } = await supabase
    .from("notifications")
    .insert(rows.map((r) => ({ ...r, type: "swap_response", roster_id: null })));
  if (error) {
    console.error("Error creando notificaciones de decisión de intercambio:", error);
  }
}
