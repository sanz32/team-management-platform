"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { runWindowEnd } from "@/lib/boost";
import LocalTime from "../LocalTime";
import { DealBadge, PriceTag } from "../PriceTag";
import type { PublicSlot, ShowcaseRaid } from "@/lib/boost-store";
import { cascadeStyle } from "@/lib/cascade";
import { useBoostLang } from "../BoostLangProvider";
import { OfferTitle } from "../BoostStorefront";
import BookingForm from "../BookingForm";
import HeroCarousel from "../HeroCarousel";
import { qualityStyle } from "../quality";

const REFRESH_POLL_MS = 3_000;
const REFRESH_POLL_TRIES = 12;

export default function RunsClient({
  slots,
  heroRaid,
  refreshPending,
  refSlug,
  formToken,
}: {
  slots: PublicSlot[];
  heroRaid: ShowcaseRaid | null;
  refreshPending: boolean;
  refSlug: string | null;
  formToken: string;
}) {
  const { lang, t } = useBoostLang();

  const [runs, setRuns] = useState<PublicSlot[]>(slots);
  const [refrescando, setRefrescando] = useState(refreshPending);

  const [slotId, setSlotId] = useState<string | null>(slots.length === 1 ? slots[0].id : null);
  const [offerId, setOfferId] = useState<string | null>(
    slots.length === 1 && slots[0].contents.length === 1 ? slots[0].contents[0].offerId : null
  );

  const eligiendoRef = useRef(false);
  useEffect(() => {
    eligiendoRef.current = offerId !== null;
  }, [offerId]);

  useEffect(() => {
    if (!refreshPending) return;
    let intentos = 0;
    let vivo = true;

    const timer = setInterval(async () => {
      intentos += 1;
      if (!vivo || intentos > REFRESH_POLL_TRIES || eligiendoRef.current) {
        clearInterval(timer);
        setRefrescando(false);
        return;
      }
      try {
        const res = await fetch("/api/boost/schedule", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { slots?: PublicSlot[] };
        if (!vivo || !Array.isArray(data.slots)) return;
        const frescas = data.slots;
        setRuns((previas) => {
          if (JSON.stringify(previas) === JSON.stringify(frescas)) return previas;
          clearInterval(timer);
          setRefrescando(false);
          return frescas;
        });
      } catch {
      }
    }, REFRESH_POLL_MS);

    return () => {
      vivo = false;
      clearInterval(timer);
    };
  }, [refreshPending]);

  const categoryLabel: Record<string, string> = {
    normal: t.categoryNormal,
    heroic: t.categoryHeroic,
    mythic: t.categoryMythic,
  };

  const backHref = refSlug ? `/boost?ref=${encodeURIComponent(refSlug)}` : "/boost";
  const abierta = runs.find((s) => s.id === slotId) ?? null;

  function elegirRun(slot: PublicSlot) {
    if (slotId === slot.id) {
      setSlotId(null);
      setOfferId(null);
      return;
    }
    setSlotId(slot.id);
    setOfferId(slot.contents.length === 1 ? slot.contents[0].offerId : null);
  }

  function elegirContenido(offerIdClickeado: string) {
    setOfferId((actual) => (actual === offerIdClickeado ? null : offerIdClickeado));
  }

  return (
    <main style={{ paddingBottom: "4rem" }}>
      <HeroCarousel
        slides={
          heroRaid
            ? [{ id: heroRaid.id, title: heroRaid.name, imageUrl: heroRaid.imageUrl, color: heroRaid.color }]
            : []
        }
        compact
        heading={
          <div>
            <div style={{ paddingBottom: "1.25rem" }}>
              <Link href={backHref} className="bst-cta-quiet">
                {t.back}
              </Link>
            </div>
            <h1 className="bst-title" style={{ fontSize: "clamp(2rem, 4.5vw, 3.1rem)" }}>
              {t.runsTitle}
            </h1>
          </div>
        }
      >
        <p className="bst-lead" style={{ marginTop: "1rem" }}>
          {t.runsLead}
        </p>
      </HeroCarousel>

      <div className="bst-shell grid gap-6" style={{ gridTemplateColumns: "minmax(0, 1fr)" }}>
        <section>
          <h2 className="bst-band-title">{t.scheduleTitle}</h2>
          <p className="bst-band-lead">
            {t.scheduleLead}
            <span aria-live="polite">
              {refrescando && (
                <span className="bst-refreshing">
                  <span className="bst-live-dot" aria-hidden />
                  {t.refreshingSpots}
                </span>
              )}
            </span>
          </p>

          {runs.length > 0 && <p className="bst-window-note">{t.windowNote}</p>}

          {runs.length === 0 ? (
            <p className="bst-band-lead">{t.noRuns}</p>
          ) : (
            <div className="flex flex-col gap-2 mt-4">
              {runs.map((slot, index) => {
                const full = slot.spotsLeft <= 0;
                const elegida = slotId === slot.id;
                return (
                  <div key={slot.id} className="cascade-item" style={cascadeStyle(index)}>
                    <button
                      type="button"
                      disabled={full}
                      onClick={() => elegirRun(slot)}
                      aria-pressed={elegida}
                      className={`bst-slot ${elegida ? "is-on" : ""}`}
                      style={qualityStyle(slot.difficulty)}
                    >
                      <span className="bst-slot-when">
                        <LocalTime
                          iso={slot.scheduledAt}
                          format={(d) =>
                            d.toLocaleString(lang === "es" ? "es-CL" : "en-US", {
                              weekday: "short",
                              day: "numeric",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          }
                        />
                        <span className="bst-slot-window">
                          {" "}
                          {t.windowSep}{" "}
                          <LocalTime
                            iso={runWindowEnd(slot.scheduledAt).toISOString()}
                            format={(d) =>
                              d.toLocaleTimeString(lang === "es" ? "es-CL" : "en-US", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            }
                          />
                        </span>
                      </span>
                      <span className="bst-slot-diff">{categoryLabel[slot.difficulty]}</span>
                      <span className="bst-slot-label">
                        {slot.contents.length === 1 ? (
                          <OfferTitle
                            title={lang === "es" ? slot.contents[0].titleEs : slot.contents[0].titleEn}
                          />
                        ) : (
                          t.contentsAvailable(slot.contents.length)
                        )}
                      </span>
                      <span className={full ? "bst-slot-left is-full" : "bst-slot-left"}>
                        {full ? t.full : `${t.spotsAvailable} ${slot.spotsLeft}`}
                        <span className="bst-slot-ratio">
                          ({slot.capacity - slot.spotsLeft}/{slot.capacity})
                        </span>
                      </span>
                    </button>

                    {elegida && (
                      <div className="bst-contents" style={qualityStyle(slot.difficulty)}>
                        <p className="bst-contents-title">{t.pickContent}</p>
                        <div className="flex flex-col gap-1.5 mt-2">
                          {slot.contents.map((content) => (
                            <button
                              key={content.offerId}
                              type="button"
                              onClick={() => elegirContenido(content.offerId)}
                              aria-pressed={offerId === content.offerId}
                              className={`bst-content ${offerId === content.offerId ? "is-on" : ""}`}
                            >
                              <span className="bst-content-name">
                                <OfferTitle title={lang === "es" ? content.titleEs : content.titleEn} />
                              </span>
                              {(lang === "es" ? content.descriptionEs : content.descriptionEn) && (
                                <span className="bst-content-desc">
                                  {lang === "es" ? content.descriptionEs : content.descriptionEn}
                                </span>
                              )}
                              <span className="bst-content-price">
                                {content.listPriceGold != null && <DealBadge />}
                                <PriceTag
                                  priceGold={content.priceGold}
                                  listPriceGold={content.listPriceGold}
                                />
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {runs.length > 0 && (
          <BookingForm
            target={{ offerId, slotId: abierta ? slotId : null }}
            refSlug={refSlug}
            formToken={formToken}
            missingTargetMessage={slotId ? t.needContent : t.needSlot}
          />
        )}
      </div>
    </main>
  );
}
