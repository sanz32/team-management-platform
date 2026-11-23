"use client";

import { Check } from "lucide-react";
import CurrencyIcon from "@/app/components/CurrencyIcon";
import { cascadeStyle } from "@/lib/cascade";
import {
  classifyDelveBounty,
  currencyLabel,
  currencyTooltip,
  formatCurrencyAmount,
  sortCurrencies,
  type CharacterCurrency,
  type DelveBounty,
} from "@/lib/sync-display";
import SyncCta from "./SyncCta";

function BountyBadge({ bounty, iconUrl }: { bounty: DelveBounty | null; iconUrl: string | null }) {
  const status = classifyDelveBounty(bounty);
  if (!status) return null;

  return (
    <div
      title={status.tooltipLines.join("\n")}
      className="mb-3 flex items-center gap-3 rounded-lg px-3 py-2.5"
      style={{
        backgroundColor: "var(--color-surface-2)",
        border: `1px solid color-mix(in srgb, ${status.ringColor} 40%, var(--color-line))`,
      }}
    >
      <span
        className="relative inline-flex shrink-0 rounded-lg"
        style={{ boxShadow: `0 0 0 2px ${status.ringColor}` }}
      >
        <span className="inline-flex" style={{ opacity: status.iconFullColor ? 1 : 0.5 }}>
          <CurrencyIcon url={iconUrl} name="Trovehunter's Bounty" size={32} />
        </span>
        {status.weeklyQuestClaimed && (
          <span
            className="absolute -bottom-1 -left-1 flex items-center justify-center w-4 h-4 rounded-full"
            style={{ backgroundColor: "var(--color-success)", border: "1px solid var(--color-surface-2)" }}
          >
            <Check className="w-2.5 h-2.5" style={{ color: "var(--color-canvas)" }} />
          </span>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className="truncate text-xs font-semibold text-ink">Trovehunter&apos;s Bounty</span>
          <span
            className="shrink-0 text-label font-medium"
            style={{ color: status.weeklyQuestClaimed ? "var(--color-success)" : "var(--color-ink-faint)" }}
          >
            Mapa {status.weeklyQuestClaimed ? "reclamado" : "disponible"}
          </span>
        </span>
        <span className="flex items-center justify-between gap-2 mt-0.5">
          <span
            className="truncate text-label font-medium"
            style={{ color: status.completions > 0 ? "var(--color-success)" : "var(--color-ink-faint)" }}
          >
            {status.completions > 0
              ? `${status.completions} delve${status.completions > 1 ? "s" : ""} completada${status.completions > 1 ? "s" : ""}`
              : "Ninguna delve completada"}
          </span>
          {status.pendingKey !== "none" && (
            <span className="shrink-0 text-label font-medium" style={{ color: status.pendingColor }}>
              {status.pendingLabel}
            </span>
          )}
        </span>
      </span>
    </div>
  );
}

export default function CurrenciesSection({
  currencies,
  currencyIcons,
  bounty,
  bountyIconUrl,
  isOwner,
}: {
  currencies: CharacterCurrency[];
  currencyIcons: Record<number, string>;
  bounty: DelveBounty | null;
  bountyIconUrl: string | null;
  isOwner: boolean;
}) {
  const rows = sortCurrencies(currencies ?? []).map((currency) => ({
    currency,
    amount: formatCurrencyAmount(currency),
  }));

  return (
    <section className="card p-5">
      <header className="mb-4">
        <h3 className="font-heading text-base font-bold text-ink">Monedas</h3>
        <p className="text-ink-faint text-xs mt-1">
          Saldo disponible de cada moneda de la temporada.
        </p>
      </header>

      <BountyBadge bounty={bounty} iconUrl={bountyIconUrl} />

      {rows.length === 0 ? (
        <div className="py-6 text-center">
          <SyncCta isOwner={isOwner} message="Este personaje todavía no subió ninguna moneda." />
        </div>
      ) : (
        <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map(({ currency, amount }, index) => (
            <div
              key={currency.currency_id}
              style={{
                ...cascadeStyle(index),
                backgroundColor: "var(--color-surface-2)",
                border: "1px solid var(--color-line)",
              }}
              title={currencyTooltip(currency, amount)}
              className="cascade-item flex items-center gap-2.5 rounded-lg px-3 py-2"
            >
              <CurrencyIcon
                url={currencyIcons[currency.currency_id] ?? null}
                name={currencyLabel(currency)}
                size={24}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs text-ink">
                  {currencyLabel(currency)}
                </span>
                {amount.capHint && (
                  <span
                    className="block truncate font-data text-micro mt-0.5"
                    style={{
                      color: amount.atCap ? "var(--color-warning)" : "var(--color-ink-faint)",
                    }}
                  >
                    {amount.atCap ? `${amount.capHint} (al tope)` : amount.capHint}
                  </span>
                )}
              </span>
              <span className="shrink-0 font-data text-sm font-bold text-ink">{amount.text}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
