"use client";

import Link from "next/link";

import type { PublicOffer, ShowcaseRaid } from "@/lib/boost-store";
import { useBoostLang } from "../BoostLangProvider";
import { OfferTitle } from "../BoostStorefront";
import BookingForm from "../BookingForm";
import HeroCarousel from "../HeroCarousel";
import { PriceTag } from "../PriceTag";
import { qualityStyle } from "../quality";

export default function BoostOfferClient({
  offer,
  raids,
  refSlug,
  formToken,
}: {
  offer: PublicOffer;
  raids: ShowcaseRaid[];
  refSlug: string | null;
  formToken: string;
}) {
  const { lang, t } = useBoostLang();

  const title = lang === "es" ? offer.titleEs : offer.titleEn;
  const description = lang === "es" ? offer.descriptionEs : offer.descriptionEn;
  const backHref = refSlug ? `/boost?ref=${encodeURIComponent(refSlug)}` : "/boost";
  const quality = qualityStyle(offer.category);

  const slides = raids.map((raid) => ({
    id: raid.id,
    title: raid.name,
    imageUrl: raid.imageUrl,
    color: raid.color,
  }));

  const cabecera = (
    <div style={quality}>
      <div style={{ paddingBottom: "1.25rem" }}>
        <Link href={backHref} className="bst-cta-quiet">
          {t.back}
        </Link>
      </div>
      <h1 className="bst-title" style={{ fontSize: "clamp(2rem, 4.5vw, 3.1rem)", color: "var(--color-q)" }}>
        <OfferTitle title={title} />
      </h1>
    </div>
  );

  return (
    <main style={{ paddingBottom: "4rem" }}>
      <HeroCarousel slides={slides} heading={cabecera} compact>
        <>
          {description && (
            <p className="bst-lead" style={{ marginTop: "1rem" }}>
              {description}
            </p>
          )}
          <div style={{ marginTop: "1.5rem" }}>
            <PriceTag priceGold={offer.priceGold} listPriceGold={offer.listPriceGold} size="lg" />
          </div>
        </>
      </HeroCarousel>

      <div className="bst-shell grid gap-6" style={{ gridTemplateColumns: "minmax(0, 1fr)" }}>
        <BookingForm target={{ offerId: offer.id }} refSlug={refSlug} formToken={formToken} />
      </div>
    </main>
  );
}
