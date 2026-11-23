import { sendDirectMessage } from "@/lib/discord-bot";
import { getCurrentPointsWeek, type PointScope } from "@/lib/points";
import { formatPointsWeekLabel } from "@/lib/format";

function getWebhookUrl(): string | null {
  return process.env.DISCORD_POINTS_WEBHOOK_URL || process.env.DISCORD_ROSTER_WEBHOOK_URL || null;
}

function portalLink(): string | null {
  const base = process.env.NEXTAUTH_URL?.replace(/\/+$/, "");
  if (!base) return null;
  return `${base}/puntos`;
}

const EMBED_COLOR = {
  primary: 0xff7d0a,
  success: 0x3fcb6b,
  danger: 0xf2555a,
};

interface EmbedPayload {
  title: string;
  description: string;
  color: number;
}

async function postToWebhook(
  content: string,
  embed: EmbedPayload,
  allowedMentions: Record<string, unknown>
): Promise<void> {
  const webhookUrl = getWebhookUrl();
  if (!webhookUrl) {
    console.warn("Sin webhook de Discord configurado, no se anunció la apelación de puntos");
    return;
  }

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, embeds: [embed], allowed_mentions: allowedMentions }),
    });
    if (!res.ok) {
      console.error("Error publicando la apelación en Discord:", await res.text());
    }
  } catch (err) {
    console.error("Error publicando la apelación en Discord:", err);
  }
}

export async function announcePointAppealCreated(): Promise<void> {
  const rlRoleId = process.env.DISCORD_RL_ROLE_ID;
  const link = portalLink();

  const description = link
    ? `Hay una apelación nueva pendiente de revisar. Entra al portal [aquí](${link}).`
    : "Hay una apelación nueva pendiente de revisar. Entra al portal, en Puntos → Administrar.";

  await postToWebhook(
    rlRoleId ? `<@&${rlRoleId}>` : "",
    {
      title: "Apelación de punto pendiente",
      description,
      color: EMBED_COLOR.primary,
    },
    { parse: ["roles"] }
  );
}

interface AppealDecisionParams {
  memberDiscordId: string | null;
  memberName: string;
  approved: boolean;
  reviewerName: string;
  pointDescription: string;
}

export async function announcePointAppealDecision({
  memberDiscordId,
  memberName,
  approved,
  reviewerName,
  pointDescription,
}: AppealDecisionParams): Promise<void> {
  if (!memberDiscordId) {
    console.warn(`Sin discord_id para ${memberName}, no se envió el DM de la apelación`);
    return;
  }

  const link = portalLink();
  const verEnElPortal = link ? `\n\nVer en el portal [aquí](${link}).` : "";

  const description = approved
    ? [
        `El punto por **${pointDescription}** queda revertido y deja de contar en tu descuento.`,
        "",
        `*Aprobada por ${reviewerName}*${verEnElPortal}`,
      ].join("\n")
    : [
        `El punto por **${pointDescription}** se mantiene tal como estaba.`,
        "",
        `*Revisada por ${reviewerName}*${verEnElPortal}`,
      ].join("\n");

  await sendDirectMessage(memberDiscordId, "", {
    title: approved ? "✅ Apelación aprobada" : "❌ Apelación rechazada",
    description,
    color: approved ? EMBED_COLOR.success : EMBED_COLOR.danger,
  });
}

interface PointAssignedParams {
  memberDiscordId: string | null;
  points: number;
  scope: PointScope;
  reason: string | null;
  bossName: string | null;
  kill: boolean | null;
  weekStart: string;
}

function describePointCause(
  scope: PointScope,
  bossName: string | null,
  kill: boolean | null,
  reason: string | null
): string | null {
  if (scope === "run" && bossName) {
    const resultado = kill === null ? "" : kill ? " (Kill)" : " (Wipe)";
    return `en la run contra **${bossName}**${resultado}`;
  }
  if (reason) return `por: ${reason}`;
  return null;
}

export async function announcePointAssigned({
  memberDiscordId,
  points,
  scope,
  reason,
  bossName,
  kill,
  weekStart,
}: PointAssignedParams): Promise<void> {
  if (!memberDiscordId) return;

  const cantidad = points === 1 ? "1 punto" : `${points} puntos`;
  const cause = describePointCause(scope, bossName, kill, reason);
  const isFutureWeek = weekStart > getCurrentPointsWeek();

  let description: string;
  let title: string;
  if (isFutureWeek) {
    const weekLabel = formatPointsWeekLabel(weekStart);
    const weekPhrase = weekLabel.charAt(0).toLowerCase() + weekLabel.slice(1);
    description = cause
      ? `Vas a tener ${cantidad} en la ${weekPhrase} ${cause}.`
      : `Vas a tener ${cantidad} en la ${weekPhrase}.`;
    title = "Punto programado";
  } else {
    const verbo = points === 1 ? "Se te cargó" : "Se te cargaron";
    description = cause
      ? scope === "run"
        ? `${verbo} ${cantidad} ${cause}.`
        : `${verbo} ${cantidad} esta semana ${cause}.`
      : `${verbo} ${cantidad} esta semana.`;
    title = "Punto registrado";
  }

  const link = portalLink();
  if (link) description += `\n\nVer en el portal [aquí](${link}).`;

  await sendDirectMessage(memberDiscordId, "", {
    title,
    description,
    color: EMBED_COLOR.primary,
  });
}
