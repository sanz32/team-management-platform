"use client";

import { useEffect, useState } from "react";
import { formatGold } from "@/lib/boost";
import { DEAL_DISCOUNT_PCT } from "@/lib/boost-deals";
import { useBoostLang } from "./BoostLangProvider";

export function PriceTag({
  priceGold,
  listPriceGold,
  size,
}: {
  priceGold: number;
  listPriceGold?: number | null;
  size?: "lg";
}) {
  const { lang, t } = useBoostLang();
  const enOferta = listPriceGold != null && listPriceGold > priceGold;

  return (
    <span className={enOferta ? "bst-price-wrap is-deal" : "bst-price-wrap"}>
      <span className="bst-price" style={size === "lg" ? { fontSize: "2rem" } : undefined}>
        {formatGold(priceGold, lang)}
        <span className="bst-price-unit">{t.gold}</span>
      </span>
      {enOferta && (
        <span className="bst-price-was">
          <span className="bst-price-was-label">{t.dealWas}</span>
          <s>{formatGold(listPriceGold, lang)}</s>
        </span>
      )}
    </span>
  );
}

export function DealBadge() {
  const { t } = useBoostLang();
  return <span className="bst-badge is-deal">{t.dealBadge(DEAL_DISCOUNT_PCT)}</span>;
}

const TICK_MS = 60_000;

function formatRestante(ms: number): string {
  const totalMin = Math.floor(ms / 60_000);
  const horas = Math.floor(totalMin / 60);
  const minutos = totalMin % 60;
  if (horas > 0) return `${horas}h ${minutos}m`;
  return `${minutos}m`;
}

export function DealsClock({ rotatesAt }: { rotatesAt: string }) {
  const { t } = useBoostLang();
  const objetivo = new Date(rotatesAt).getTime();
  const [restante, setRestante] = useState<number | null>(null);

  useEffect(() => {
    if (!Number.isFinite(objetivo)) return;
    const tick = () => setRestante(objetivo - Date.now());
    tick();
    const timer = setInterval(tick, TICK_MS);
    return () => clearInterval(timer);
  }, [objetivo]);

  if (restante == null) return null;

  return (
    <p className="bst-deals-clock">
      <span className="bst-deals-clock-value">
        {restante > 60_000 ? formatRestante(restante) : "<1m"}
      </span>
      <span className="bst-deals-clock-label">{t.dealsClockLabel}</span>
    </p>
  );
}
