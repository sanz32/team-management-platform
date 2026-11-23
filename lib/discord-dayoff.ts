import { formatDayLabel } from "./format";

function getWebhookUrl(): string | null {
  return process.env.DISCORD_DAYOFF_WEBHOOK_URL || process.env.DISCORD_ROSTER_WEBHOOK_URL || null;
}

function portalLink(panel: "aprobaciones" | "intercambios"): string | null {
  const base = process.env.NEXTAUTH_URL?.replace(/\/+$/, "");
  if (!base) return null;
  return `${base}/dias-libres?panel=${panel}`;
}

const EMBED_COLOR = {
  primary: 0xff7d0a,
  success: 0x3fcb6b,
  danger: 0xf2555a,
};

interface SwapParties {
  requesterName: string;
  requesterDate: string;
  requesterDiscordId: string | null;
  recipientName: string;
  recipientDate: string;
  recipientDiscordId: string | null;
}

function mention(discordId: string | null, fallbackName: string): string {
  return discordId ? `<@${discordId}>` : `**${fallbackName}**`;
}

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
    console.warn("Sin webhook de Discord configurado, no se anunció el intercambio de días libres");
    return;
  }

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, embeds: [embed], allowed_mentions: allowedMentions }),
    });
    if (!res.ok) {
      console.error("Error publicando el intercambio en Discord:", await res.text());
    }
  } catch (err) {
    console.error("Error publicando el intercambio en Discord:", err);
  }
}

export async function announceSwapAwaitingApproval(parties: SwapParties): Promise<void> {
  const rlRoleId = process.env.DISCORD_RL_ROLE_ID;
  const link = portalLink("aprobaciones");

  const description = [
    `**${parties.requesterName}** cede su día libre del **${formatDayLabel(parties.requesterDate)}**`,
    `**${parties.recipientName}** cede su día libre del **${formatDayLabel(parties.recipientDate)}**`,
    "",
    link
      ? `Los dos ya están de acuerdo. Revísenlo en el portal [aquí](${link}).`
      : "Los dos ya están de acuerdo. Revísenlo en el portal, en Días Libres → Aprobaciones.",
  ].join("\n");

  await postToWebhook(
    rlRoleId ? `<@&${rlRoleId}>` : "",
    {
      title: "Intercambio de días libres pendiente de aprobación",
      description,
      color: EMBED_COLOR.primary,
    },
    { parse: ["roles"] }
  );
}

export async function announceSwapDecision(
  parties: SwapParties,
  approved: boolean,
  reviewerName: string
): Promise<void> {
  const requester = mention(parties.requesterDiscordId, parties.requesterName);
  const recipient = mention(parties.recipientDiscordId, parties.recipientName);
  const link = portalLink("intercambios");
  const verEnElPortal = link ? `\n\nVer en el portal [aquí](${link}).` : "";

  const description = approved
    ? [
        `**${parties.requesterName}** pasa a tener libre el **${formatDayLabel(parties.recipientDate)}**`,
        `**${parties.recipientName}** pasa a tener libre el **${formatDayLabel(parties.requesterDate)}**`,
        "",
        `*Aprobado por ${reviewerName}*${verEnElPortal}`,
      ].join("\n")
    : [
        `**${parties.requesterName}** conserva su día libre del **${formatDayLabel(parties.requesterDate)}**`,
        `**${parties.recipientName}** conserva su día libre del **${formatDayLabel(parties.recipientDate)}**`,
        "",
        `*Revisado por ${reviewerName}*${verEnElPortal}`,
      ].join("\n");

  const users = [parties.requesterDiscordId, parties.recipientDiscordId].filter(
    (id): id is string => Boolean(id)
  );

  await postToWebhook(
    `${requester} ${recipient}`,
    {
      title: approved
        ? "✅ Intercambio de días libres aprobado"
        : "❌ Intercambio de días libres no aprobado",
      description,
      color: approved ? EMBED_COLOR.success : EMBED_COLOR.danger,
    },
    { users }
  );
}
