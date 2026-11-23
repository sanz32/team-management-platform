"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Search, X } from "lucide-react";
import { formatGold, splitOfferTitle, type BoostCategory } from "@/lib/boost";
import type { PublicOffer, ShowcaseRaid } from "@/lib/boost-store";
import type { StorefrontRaider } from "@/lib/boost-links";
import { cascadeStyle } from "@/lib/cascade";
import { matchesSearch } from "@/lib/search-fold";
import { useBoostLang } from "./BoostLangProvider";
import { DEAL_DISCOUNT_PCT } from "@/lib/boost-deals";
import AdvCard from "./AdvCard";
import HeroCarousel, { type HeroSlide } from "./HeroCarousel";
import { DealBadge, DealsClock, PriceTag } from "./PriceTag";
import { QUALITY_ORDER, qualityStyle } from "./quality";

function mythicCleared(offers: PublicOffer[], raid: ShowcaseRaid): number {
  const bossCount = raid.bosses.length;
  const miticos = offers.filter((o) => o.category === "mythic");

  let best = 0;
  for (const offer of miticos) {
    const match = offer.titleEn.match(/(\d+)\s*\/\s*(\d+)/);
    if (!match) continue;
    const cleared = Number(match[1]);
    const total = Number(match[2]);
    if (total !== bossCount) continue;
    if (cleared > best) best = Math.min(cleared, bossCount);
  }
  if (best > 0) return best;

  const nombre = raid.name.toLowerCase().replace(/^the\s+/, "");
  const abbr = raid.abbr?.toLowerCase() ?? "";
  const seVende = miticos.some((o) => {
    const titulo = o.titleEn.toLowerCase();
    if (titulo.includes(nombre)) return true;
    return abbr.length > 0 && new RegExp(`\\b${abbr}\\b`).test(titulo);
  });

  return seVende ? bossCount : 0;
}

export function OfferTitle({ title }: { title: string }) {
  return (
    <>
      {splitOfferTitle(title).map((segment, i) =>
        segment.jargon ? (
          <span key={i} className="bst-jargon">
            {segment.text}
          </span>
        ) : (
          <span key={i}>{segment.text}</span>
        )
      )}
    </>
  );
}

function OfferCard({ offer, href, index }: { offer: PublicOffer; href: string; index: number }) {
  const { lang, t } = useBoostLang();
  const title = lang === "es" ? offer.titleEs : offer.titleEn;
  const description = lang === "es" ? offer.descriptionEs : offer.descriptionEn;
  const enOferta = offer.listPriceGold != null;

  return (
    <Link
      href={href}
      className={`bst-item cascade-item ${enOferta ? "is-deal" : ""}`}
      style={{ ...qualityStyle(offer.category), ...cascadeStyle(index) }}
    >
      <span className="bst-item-top">
        <span className="bst-item-name">
          <OfferTitle title={title} />
        </span>
        {enOferta ? <DealBadge /> : offer.badge ? <span className="bst-badge">{offer.badge}</span> : null}
      </span>
      {description && <span className="bst-item-desc">{description}</span>}
      <span className="bst-item-foot">
        <PriceTag priceGold={offer.priceGold} listPriceGold={offer.listPriceGold} />
        <span className="bst-item-go">{t.view}</span>
      </span>
    </Link>
  );
}

function DealCard({ offer, href, index }: { offer: PublicOffer; href: string; index: number }) {
  const { lang } = useBoostLang();
  const title = lang === "es" ? offer.titleEs : offer.titleEn;
  const ahorro = offer.listPriceGold != null ? offer.listPriceGold - offer.priceGold : 0;

  return (
    <Link
      href={href}
      className="bst-deal cascade-item"
      style={{ ...qualityStyle(offer.category), ...cascadeStyle(index) }}
    >
      <span className="bst-deal-seal">
        <span className="bst-deal-seal-pct">−{DEAL_DISCOUNT_PCT}%</span>
      </span>
      <span className="bst-deal-name">
        <OfferTitle title={title} />
      </span>
      <span className="bst-deal-prices">
        <span className="bst-deal-now">{formatGold(offer.priceGold, lang)}</span>
        {offer.listPriceGold != null && (
          <s className="bst-deal-was">{formatGold(offer.listPriceGold, lang)}</s>
        )}
      </span>
      {ahorro > 0 && (
        <span className="bst-deal-save">{lang === "es" ? "ahorras " : "you save "}{formatGold(ahorro, lang)}</span>
      )}
    </Link>
  );
}

const GROUP_PREVIEW = 6;

interface OfferGroupData {
  category: BoostCategory;
  label: string;
  offers: PublicOffer[];
}

function OfferGroup({
  group,
  categoryLabel,
  offerHref,
  collapsible,
}: {
  group: OfferGroupData;
  categoryLabel: string;
  offerHref: (id: string) => string;
  collapsible: boolean;
}) {
  const { t } = useBoostLang();
  const [abierto, setAbierto] = useState(false);

  const recorta = collapsible && !abierto && group.offers.length > GROUP_PREVIEW;
  const visibles = recorta ? group.offers.slice(0, GROUP_PREVIEW) : group.offers;
  const ocultas = group.offers.length - visibles.length;

  return (
    <div className="bst-group">
      <div className="bst-group-head" style={qualityStyle(group.category)}>
        <h2 className="bst-group-name">{group.label || categoryLabel}</h2>
        <span className="bst-plate-name">{categoryLabel}</span>
        <span className="bst-group-count">{t.packagesCount(group.offers.length)}</span>
      </div>
      <div className="bst-grid">
        {visibles.map((offer, index) => (
          <OfferCard key={offer.id} offer={offer} href={offerHref(offer.id)} index={index} />
        ))}
      </div>
      {collapsible && group.offers.length > GROUP_PREVIEW && (
        <button type="button" className="bst-group-more" onClick={() => setAbierto((v) => !v)}>
          {abierto ? t.showLess : t.showMore(ocultas)}
        </button>
      )}
    </div>
  );
}

export default function BoostStorefront({
  offers,
  openRuns,
  dealsRotateAt,
  raids,
  raider,
  refSlug,
  errorCode,
}: {
  offers: PublicOffer[];
  openRuns: number;
  dealsRotateAt: string;
  raids: ShowcaseRaid[];
  raider: StorefrontRaider | null;
  refSlug: string | null;
  errorCode: string | null;
}) {
  const { t } = useBoostLang();
  const [filter, setFilter] = useState<BoostCategory | "all" | "deals">("all");

  const categoryLabel: Record<BoostCategory, string> = {
    normal: t.categoryNormal,
    heroic: t.categoryHeroic,
    mythic: t.categoryMythic,
  };

  const [query, setQuery] = useState("");

  const dealOffers = useMemo(() => offers.filter((o) => o.listPriceGold != null), [offers]);
  const dealCount = dealOffers.length;

  const railRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;

    function onWheel(e: WheelEvent) {
      const el = railRef.current;
      if (!el) return;
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;

      const paso =
        e.deltaMode === 1
          ? e.deltaY * 24
          : e.deltaMode === 2
            ? e.deltaY * el.clientWidth
            : e.deltaY;
      if (paso === 0) return;

      const max = el.scrollWidth - el.clientWidth;
      if (max <= 0) return;
      const alInicio = el.scrollLeft <= 0;
      const alFinal = el.scrollLeft >= max - 1;
      if ((paso < 0 && alInicio) || (paso > 0 && alFinal)) return;

      e.preventDefault();
      el.scrollLeft += paso;
    }

    rail.addEventListener("wheel", onWheel, { passive: false });
    return () => rail.removeEventListener("wheel", onWheel);
  }, [dealCount]);

  const visible = useMemo(() => {
    let lista = offers;
    if (filter === "deals") lista = lista.filter((o) => o.listPriceGold != null);
    else if (filter !== "all") lista = lista.filter((o) => o.category === filter);

    const q = query.trim();
    if (!q) return lista;
    return lista.filter((o) =>
      matchesSearch(q, o.titleEn, o.titleEs, o.descriptionEn, o.descriptionEs)
    );
  }, [offers, filter, query]);

  const groups = useMemo(() => {
    const map = new Map<string, { category: BoostCategory; label: string; offers: PublicOffer[] }>();
    for (const offer of visible) {
      const key = `${offer.category}::${offer.groupLabel}`;
      if (!map.has(key)) map.set(key, { category: offer.category, label: offer.groupLabel, offers: [] });
      map.get(key)!.offers.push(offer);
    }
    return [...map.values()].sort(
      (a, b) =>
        QUALITY_ORDER.indexOf(a.category) - QUALITY_ORDER.indexOf(b.category) ||
        a.label.localeCompare(b.label)
    );
  }, [visible]);

  const mythicByRaid = useMemo(
    () => new Map(raids.map((raid) => [raid.id, mythicCleared(offers, raid)])),
    [offers, raids]
  );


  const heroSlides = useMemo<HeroSlide[]>(() => {
    if (raids.length === 0) {
      return [{ id: "default", title: t.heroTitle, imageUrl: null, color: null }];
    }
    return raids.map((raid) => ({
      id: raid.id,
      title: raid.name,
      imageUrl: raid.imageUrl,
      color: raid.color,
    }));
  }, [raids, t]);
  const offerHref = (id: string) => (refSlug ? `/boost/${id}?ref=${encodeURIComponent(refSlug)}` : `/boost/${id}`);
  const runsHref = refSlug ? `/boost/disponible?ref=${encodeURIComponent(refSlug)}` : "/boost/disponible";

  function pedirCuposFrescos() {
    try {
      void fetch("/api/boost/refresh-request", { method: "POST", keepalive: true }).catch(() => {});
    } catch {
    }
  }

  const flows = [
    {
      title: t.howNowTitle,
      lead: t.howNowLead,
      steps: [
        { title: t.stepRunTitle, body: t.stepRunBody },
        { title: t.stepConfirmTitle, body: t.stepConfirmBody },
        { title: t.stepContactTitle, body: t.stepContactBodyRun },
      ],
    },
    {
      title: t.howSpecificTitle,
      lead: t.howSpecificLead,
      steps: [
        { title: t.stepPickTitle, body: t.stepPickBody },
        { title: t.stepConfirmTitle, body: t.stepConfirmBody },
        { title: t.stepContactTitle, body: t.stepContactBodyPackage },
      ],
    },
  ];

  return (
    <main>
      <HeroCarousel slides={heroSlides} aside={raider ? <AdvCard raider={raider} /> : null}>
        <>
          <p className="bst-lead">{t.heroLead}</p>
          <div className="bst-hero-actions">
            <Link href={runsHref} className="bst-cta bst-cta-live" onClick={pedirCuposFrescos}>
              {openRuns > 0 && <span className="bst-live-dot" aria-hidden />}
              {t.browse}
              {openRuns > 0 && <span className="bst-live-count">{t.openRuns(openRuns)}</span>}
            </Link>
            <a href="#how" className="bst-cta-quiet">
              {t.howItWorks}
            </a>
          </div>
          <p className="bst-hero-note">{t.heroPriceNote}</p>
        </>
      </HeroCarousel>

      {raids.length > 0 && (
        <section className="bst-shell">
          <div className="bst-raids">
            {raids.map((raid) => {
              const cleared = mythicByRaid.get(raid.id) ?? 0;
              return (
                <article
                  key={raid.id}
                  className="bst-raid"
                  style={{ "--raid": raid.color ?? "var(--color-primary)" } as React.CSSProperties}
                >
                  <header className="bst-raid-head">
                    <h2 className="bst-raid-name">{raid.name}</h2>
                    <p className="bst-raid-meta">
                      {t.bossesSold(cleared, raid.bosses.length)}
                    </p>
                  </header>
                  <ul className="bst-boss-row">
                    {raid.bosses.map((boss, i) => (
                      <li
                        key={boss.name}
                        className={i < cleared ? "bst-boss is-on" : "bst-boss"}
                        title={boss.name}
                      >
                        {boss.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={boss.imageUrl} alt="" className="bst-boss-art" loading="lazy" />
                        ) : (
                          <span className="bst-boss-art" />
                        )}
                        <span className="bst-boss-name">{boss.name}</span>
                      </li>
                    ))}
                  </ul>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {dealCount > 0 && (
        <section className="bst-deals-wrap">
          <div className="bst-shell">
            <div className="bst-deals-head">
              <div>
                <h2 className="bst-deals-title">{t.dealsStripTitle}</h2>
                <p className="bst-deals-lead">{t.dealsStripLead(dealCount, DEAL_DISCOUNT_PCT)}</p>
              </div>
              <DealsClock rotatesAt={dealsRotateAt} />
            </div>

            <div className="bst-deals-rail" ref={railRef}>
              {dealOffers.map((offer, index) => (
                <DealCard
                  key={offer.id}
                  offer={offer}
                  href={offerHref(offer.id)}
                  index={index}
                />
              ))}
            </div>

            <button
              type="button"
              className="bst-deals-all"
              onClick={() => {
                setFilter("deals");
                setQuery("");
                document.getElementById("packages")?.scrollIntoView({ behavior: "smooth" });
              }}
            >
              {t.dealsStripAll}
            </button>
          </div>
        </section>
      )}

      <section id="packages" className="bst-shell">
        {errorCode && (
          <p className="bst-alert mb-4" role="alert">
            {t.errors[errorCode] ?? t.errors.generico}
          </p>
        )}

        <div className="bst-section-head">
          <span className="bst-section-rule" aria-hidden />
          <div className="bst-section-mid">
            <h2 className="bst-section-title">{t.allServicesTitle}</h2>
            <p className="bst-section-sub">{t.allServicesCount(offers.length)}</p>
          </div>
          <span className="bst-section-rule" aria-hidden />
        </div>

        <div className="bst-filters">
          <button
            type="button"
            className={filter === "all" ? "bst-filter is-on" : "bst-filter"}
            onClick={() => setFilter("all")}
          >
            {t.categoryAll}
          </button>
          {dealCount > 0 && (
            <button
              type="button"
              className={filter === "deals" ? "bst-filter is-deal is-on" : "bst-filter is-deal"}
              onClick={() => setFilter("deals")}
            >
              {t.dealsFilter}
              <span className="bst-filter-count">{dealCount}</span>
            </button>
          )}
          <label className="bst-search">
            <Search className="w-3.5 h-3.5 shrink-0" aria-hidden />
            <input
              type="search"
              className="bst-search-input"
              value={query}
              placeholder={t.searchPlaceholder}
              aria-label={t.searchPlaceholder}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button
                type="button"
                className="bst-search-clear"
                onClick={() => setQuery("")}
                aria-label={t.searchClear}
              >
                <X className="w-3.5 h-3.5" aria-hidden />
              </button>
            )}
          </label>
          {QUALITY_ORDER.map((category) => (
            <button
              key={category}
              type="button"
              style={qualityStyle(category)}
              className={filter === category ? "bst-filter is-on" : "bst-filter"}
              onClick={() => setFilter(category)}
            >
              {categoryLabel[category]}
            </button>
          ))}
        </div>

        {offers.length === 0 ? (
          <p className="bst-lead">{t.empty}</p>
        ) : groups.length === 0 ? (
          <p className="bst-lead">{query.trim() ? t.emptySearch : t.emptyFiltered}</p>
        ) : (
          groups.map((group) => (
            <OfferGroup
              key={`${group.category}::${group.label}`}
              group={group}
              categoryLabel={categoryLabel[group.category]}
              offerHref={offerHref}
              collapsible={filter === "all" && !query.trim()}
            />
          ))
        )}
      </section>

      <section id="how" className="bst-shell bst-band">
        <h2 className="bst-band-title">{t.howItWorks}</h2>
        {flows.map((flow) => (
          <div key={flow.title} className="bst-flow">
            <h3 className="bst-flow-title">{flow.title}</h3>
            <p className="bst-flow-lead">{flow.lead}</p>
            <div className="bst-cols">
              {flow.steps.map((step, i) => (
                <div key={step.title} className="bst-step">
                  <p className="bst-step-n">{i + 1}</p>
                  <h4 className="bst-def-title mt-1.5">{step.title}</h4>
                  <p className="bst-def-body">{step.body}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>

      <section className="bst-shell bst-band">
        <h2 className="bst-band-title">{t.glossaryTitle}</h2>
        <div className="bst-cols">
          <div>
            <h3 className="bst-def-title">{t.fpTitle}</h3>
            <p className="bst-def-body">{t.fpBody}</p>
          </div>
          <div>
            <h3 className="bst-def-title">{t.atpTitle}</h3>
            <p className="bst-def-body">{t.atpBody}</p>
          </div>
          <div>
            <h3 className="bst-def-title">{t.savedTitle}</h3>
            <p className="bst-def-body">{t.savedBody}</p>
          </div>
        </div>

        <div className="mt-10">
          <h2 className="bst-band-title">{t.goldOnlyTitle}</h2>
          <p className="bst-band-lead">{t.goldOnlyBody}</p>
        </div>
      </section>
    </main>
  );
}
