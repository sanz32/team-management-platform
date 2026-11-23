import { classEmoji } from "./discord-emojis";
import { capitalize } from "./format";
import { RosterSelection } from "./roster-generator";
import type { MochilaAssignee } from "./roster-mochila";
import { formatRosterTitle, RosterContentSummary } from "./roster-title";
import type { RaidDef } from "./raids";

const ROLE_ORDER: Record<string, number> = { tank: 0, heal: 1, dps: 2 };

const ROLE_ICONS: Record<string, string> = {
  tank: "🛡️",
  heal: "✚",
  dps: "⚔️",
};

const MAX_CONTENT_LENGTH = 1900;

interface RosterAnnouncementData {
  scheduledFor: string;
  selected: RosterSelection[];
  averageIlvl: number;
  content?: RosterContentSummary | null;
  mochilaAssignees?: MochilaAssignee[] | null;
}

function formatEntry(entry: RosterSelection): string {
  const c = entry.candidate;
  const roleIcon = ROLE_ICONS[entry.role] ?? "";
  const classIcon = classEmoji(c.class);
  const statusEmoji = entry.isSaved === null ? "" : entry.isSaved ? " — 🔴" : " — 🟢";
  const offSpecNote = c.isOffSpec && c.specUsed ? ` (Off-Spec: ${c.specUsed})` : "";
  const label = `**${capitalize(c.name)}-${c.realm_slug} — ilvl ${c.ilvl}${offSpecNote}${statusEmoji}**`;
  return [roleIcon, classIcon, label].filter(Boolean).join(" ");
}

function formatMochila(assignees: MochilaAssignee[]): string {
  const names = assignees.map((a) => a.discordUsername).join(", ");
  return `🎒 **Mochila: ${names}**`;
}

function truncateToLimit(content: string): string {
  if (content.length <= MAX_CONTENT_LENGTH) return content;
  const note = "\n\n*(mensaje truncado — ver el roster completo en la app)*";
  const cut = content.slice(0, MAX_CONTENT_LENGTH - note.length);
  const lastBreak = cut.lastIndexOf("\n");
  return (lastBreak > 0 ? cut.slice(0, lastBreak) : cut) + note;
}

export function buildRosterAnnouncementContent(
  roster: RosterAnnouncementData,
  roleId: string | undefined,
  raids: Pick<RaidDef, "key" | "name">[]
): string {
  const mention = roleId ? `<@&${roleId}> ` : "";
  const title = formatRosterTitle(roster.scheduledFor, roster.content, raids);

  const byRole = new Map<string, RosterSelection[]>();
  for (const entry of roster.selected) {
    const list = byRole.get(entry.role) ?? [];
    list.push(entry);
    byRole.set(entry.role, list);
  }

  const sections = Array.from(byRole.entries())
    .sort((a, b) => (ROLE_ORDER[a[0]] ?? 99) - (ROLE_ORDER[b[0]] ?? 99))
    .map(([, entries]) => entries.map(formatEntry).join("\n"));

  const mochila = roster.mochilaAssignees ?? [];

  return truncateToLimit(
    [
      `${mention}**${title}**`,
      ...sections,
      ...(mochila.length > 0 ? [formatMochila(mochila)] : []),
      `*Promedio ilvl: ${roster.averageIlvl.toFixed(1)}*`,
    ].join("\n\n")
  );
}

function parseWebhookUrl(url: string): { id: string; token: string } | null {
  const match = url.match(/\/webhooks\/(\d+)\/([^/?]+)/);
  if (!match) return null;
  return { id: match[1], token: match[2] };
}

export async function announceRoster(
  roster: RosterAnnouncementData,
  raids: Pick<RaidDef, "key" | "name">[]
): Promise<string | null> {
  const webhookUrl = process.env.DISCORD_ROSTER_WEBHOOK_URL;
  const roleId = process.env.DISCORD_REQUIRED_ROLE_ID;

  if (!webhookUrl) {
    console.warn("DISCORD_ROSTER_WEBHOOK_URL no configurado, no se anunció el roster en Discord");
    return null;
  }

  const content = buildRosterAnnouncementContent(roster, roleId, raids);

  try {
    const res = await fetch(`${webhookUrl}?wait=true`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content,
        allowed_mentions: { parse: ["roles"] },
      }),
    });

    if (!res.ok) {
      console.error("Error publicando el roster en Discord:", await res.text());
      return null;
    }

    const message = await res.json().catch(() => null);
    return message?.id ?? null;
  } catch (err) {
    console.error("Error publicando el roster en Discord:", err);
    return null;
  }
}

export async function deleteRosterAnnouncement(messageId: string): Promise<void> {
  const webhookUrl = process.env.DISCORD_ROSTER_WEBHOOK_URL;
  if (!webhookUrl) return;

  const parsed = parseWebhookUrl(webhookUrl);
  if (!parsed) {
    console.error("DISCORD_ROSTER_WEBHOOK_URL no tiene el formato esperado (.../webhooks/id/token)");
    return;
  }

  try {
    const res = await fetch(
      `https://discord.com/api/webhooks/${parsed.id}/${parsed.token}/messages/${messageId}`,
      { method: "DELETE" }
    );

    if (!res.ok && res.status !== 404) {
      console.error("Error borrando el roster anterior en Discord:", await res.text());
    }
  } catch (err) {
    console.error("Error borrando el roster anterior en Discord:", err);
  }
}
