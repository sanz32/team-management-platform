"use client";

import type { StorefrontRaider } from "@/lib/boost-links";
import { useBoostLang } from "./BoostLangProvider";

export default function AdvCard({ raider }: { raider: StorefrontRaider }) {
  const { t } = useBoostLang();

  const color1 = raider.frameColor1 ?? "var(--color-primary)";
  const color2 = raider.frameColor2 ?? "var(--color-secondary)";

  const inicial = raider.name.trim().charAt(0).toUpperCase();

  return (
    <aside
      className="bst-adv"
      style={{ "--adv-1": color1, "--adv-2": color2 } as React.CSSProperties}
    >
      <p className="bst-adv-label">{t.advLabel}</p>

      <div className="bst-adv-ring">
        {raider.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={raider.avatarUrl} alt="" className="bst-adv-avatar" width={88} height={88} />
        ) : (
          <span className="bst-adv-avatar bst-adv-initial" aria-hidden>
            {inicial}
          </span>
        )}
      </div>

      <p className="bst-adv-name">{raider.name}</p>
      {raider.username && raider.username !== raider.name && (
        <p className="bst-adv-user">{raider.username}</p>
      )}

      {raider.discordId ? (
        <>
          <a href={`discord://-/users/${raider.discordId}`} className="bst-adv-cta">
            {t.advContact}
          </a>
          <a
            href={`https://discord.com/users/${raider.discordId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="bst-adv-alt"
          >
            {t.openInBrowser}
          </a>
        </>
      ) : (
        <p className="bst-adv-alt">{t.advNoContact}</p>
      )}
    </aside>
  );
}
