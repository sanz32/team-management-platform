function getWebhookUrl(): string | null {
  return process.env.DISCORD_SPLITS_WEBHOOK_URL || process.env.DISCORD_ROSTER_WEBHOOK_URL || null;
}

function splitsLink(): string | null {
  const base = process.env.NEXTAUTH_URL?.replace(/\/+$/, "");
  if (!base) return null;
  return `${base}/wishlist?panel=splits&view=all`;
}

export async function announceSplitPublished(splitName: string, rlName: string): Promise<boolean> {
  const webhookUrl = getWebhookUrl();
  if (!webhookUrl) {
    console.warn("Sin webhook de Discord configurado, no se anunció el split de Wishlist");
    return false;
  }

  const roleId = process.env.DISCORD_REQUIRED_ROLE_ID;
  const link = splitsLink();
  const description = link
    ? `**${splitName}**, creado por **${rlName}**, ya se encuentra disponible en la web, revísalo [Aquí](${link}).`
    : `**${splitName}**, creado por **${rlName}**, ya se encuentra disponible en la web.`;

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: roleId ? `<@&${roleId}>` : "",
        embeds: [
          {
            title: "📋 Nuevo split de Wishlist disponible",
            description,
            color: 0xff7d0a,
          },
        ],
        allowed_mentions: { parse: ["roles"] },
      }),
    });
    if (!res.ok) {
      console.error("Error publicando el split en Discord:", await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error("Error publicando el split en Discord:", err);
    return false;
  }
}
