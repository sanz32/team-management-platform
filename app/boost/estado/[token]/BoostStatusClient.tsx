"use client";

import Link from "next/link";
import { formatGold, type BoostStatus } from "@/lib/boost";
import type { PublicBookingView } from "@/lib/boost-store";
import { useBoostLang } from "../../BoostLangProvider";
import LocalTime from "../../LocalTime";
import { CAJA } from "../../caja";

export default function BoostStatusClient({
  booking,
  justCreated,
}: {
  booking: PublicBookingView | null;
  justCreated: boolean;
}) {
  const { lang, t } = useBoostLang();

  if (!booking) {
    return (
      <main className="bst-shell" style={{ paddingBlock: "5rem 6rem" }}>
        <h1 className="bst-title" style={{ fontSize: "clamp(2rem, 4.5vw, 3rem)" }}>
          {t.statusNotFound}
        </h1>
        <div className="bst-hero-actions">
          <Link href="/boost" className="bst-cta">
            {t.backHome}
          </Link>
        </div>
      </main>
    );
  }

  const statusLabel: Record<BoostStatus, string> = {
    pending: t.statusPending,
    confirmed: t.statusConfirmed,
    completed: t.statusCompleted,
    cancelled: t.statusCancelled,
  };

  const when = booking.slotScheduledAt
    ? new Date(booking.slotScheduledAt).toLocaleString(lang === "es" ? "es-CL" : "en-US", {
        weekday: "long",
        day: "numeric",
        month: "long",
        hour: "2-digit",
        minute: "2-digit",
      })
    : t.toAgree;

  return (
    <main className="bst-shell" style={{ paddingBlock: "3.5rem 5rem" }}>
      <h1 className="bst-title" style={{ fontSize: "clamp(2.2rem, 5vw, 3.4rem)" }}>
        {t.confirmTitle}
      </h1>
      <p className="bst-lead">
        {booking.raiderName ? t.confirmLead(booking.raiderName) : t.confirmLeadUnassigned}
      </p>

      {booking.raiderDiscordId && (
        <div>
          <div className="bst-hero-actions">
            <a href={`discord://-/users/${booking.raiderDiscordId}`} className="bst-cta">
              {t.confirmContact} {booking.raiderName}
            </a>
          </div>
          <p className="mt-3">
            <a
              href={`https://discord.com/users/${booking.raiderDiscordId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="bst-cta-quiet"
            >
              {t.openInBrowser}
            </a>
          </p>
        </div>
      )}

      <section style={{ ...CAJA, marginTop: "2.5rem", maxWidth: "640px" }}>
        <p className="bst-plate-title">{t.confirmDetails}</p>
        <div style={{ marginTop: "0.5rem" }}>
          <div className="bst-receipt-row">
            <span className="bst-receipt-key">{t.package}</span>
            <span className="bst-receipt-value">{booking.offerTitle}</span>
          </div>
          <div className="bst-receipt-row">
            <span className="bst-receipt-key">{t.runTime}</span>
            {booking.slotScheduledAt ? (
              <LocalTime
                className="bst-receipt-value"
                iso={booking.slotScheduledAt}
                format={(d) =>
                  d.toLocaleString(lang === "es" ? "es-CL" : "en-US", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                }
              />
            ) : (
              <span className="bst-receipt-value">{when}</span>
            )}
          </div>
          <div className="bst-receipt-row">
            <span className="bst-receipt-key">{t.character}</span>
            <span className="bst-receipt-value">
              {booking.characterName}-{booking.characterRealm} ({booking.characterRegion.toUpperCase()})
            </span>
          </div>
          <div className="bst-receipt-row">
            <span className="bst-receipt-key">{t.price}</span>
            {booking.offerPriceGold == null ? (
              <span className="bst-receipt-value">{t.toAgree}</span>
            ) : (
              <span className="bst-receipt-value bst-price" style={{ fontSize: "1rem" }}>
                {formatGold(booking.offerPriceGold, lang)}
                <span className="bst-price-unit">{t.gold}</span>
              </span>
            )}
          </div>
          <div className="bst-receipt-row">
            <span className="bst-receipt-key">{t.statusLabel}</span>
            <span className="bst-receipt-value">{statusLabel[booking.status]}</span>
          </div>
        </div>
      </section>

      {justCreated && (
        <p className="bst-def-body" style={{ marginTop: "1.5rem" }}>
          {t.saveLink}
        </p>
      )}

      <div className="bst-hero-actions">
        <Link href="/boost" className="bst-cta-quiet">
          {t.backHome}
        </Link>
      </div>
    </main>
  );
}
