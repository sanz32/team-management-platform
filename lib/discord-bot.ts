const DISCORD_API_BASE = "https://discord.com/api/v10";

interface EmbedPayload {
  title: string;
  description: string;
  color: number;
}

export async function sendDirectMessage(
  discordUserId: string,
  content: string,
  embed?: EmbedPayload
): Promise<boolean> {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    console.warn("Sin DISCORD_BOT_TOKEN configurado, no se envió el DM de Discord");
    return false;
  }

  const headers = {
    Authorization: `Bot ${token}`,
    "Content-Type": "application/json",
  };

  try {
    const channelRes = await fetch(`${DISCORD_API_BASE}/users/@me/channels`, {
      method: "POST",
      headers,
      body: JSON.stringify({ recipient_id: discordUserId }),
    });

    if (!channelRes.ok) {
      console.warn(
        `No se pudo abrir el canal de DM con ${discordUserId} (status ${channelRes.status}):`,
        await channelRes.text()
      );
      return false;
    }

    const channel = (await channelRes.json()) as { id: string };

    const messageRes = await fetch(`${DISCORD_API_BASE}/channels/${channel.id}/messages`, {
      method: "POST",
      headers,
      body: JSON.stringify({ content, embeds: embed ? [embed] : [] }),
    });

    if (!messageRes.ok) {
      console.error(
        `Error enviando el DM de Discord a ${discordUserId} (status ${messageRes.status}):`,
        await messageRes.text()
      );
      return false;
    }

    return true;
  } catch (err) {
    console.error("Error enviando el DM de Discord:", err);
    return false;
  }
}

export interface DiscordUserNames {
  username: string;
  globalName: string | null;
}

export async function fetchDiscordUserNames(
  discordUserId: string
): Promise<DiscordUserNames | null> {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    console.warn("Sin DISCORD_BOT_TOKEN configurado, no se pudo leer el nombre de Discord");
    return null;
  }

  try {
    const res = await fetch(`${DISCORD_API_BASE}/users/${discordUserId}`, {
      headers: { Authorization: `Bot ${token}` },
    });

    if (!res.ok) {
      if (res.status !== 404 && res.status !== 400) {
        console.warn(
          `No se pudo leer el usuario de Discord ${discordUserId} (status ${res.status})`
        );
      }
      return null;
    }

    const data = (await res.json()) as { username?: string; global_name?: string | null };
    if (!data.username) return null;
    return { username: data.username, globalName: data.global_name ?? null };
  } catch (err) {
    console.error("Error leyendo el usuario de Discord:", err);
    return null;
  }
}
