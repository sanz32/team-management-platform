import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getActiveOfferById, getSeasonShowcase, type ShowcaseRaid } from "@/lib/boost-store";
import { raidsForOffer } from "@/lib/boost-raid-match";
import { isTeamSlug } from "@/lib/boost-teams";
import { issueFormToken } from "@/lib/boost-draft";
import StorefrontPage from "../StorefrontPage";
import { storefrontMetadata } from "../storefront-metadata";
import BoostOfferClient from "./BoostOfferClient";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ segmento: string }>;
}): Promise<Metadata> {
  const { segmento } = await params;

  if (isTeamSlug(segmento)) {
    return storefrontMetadata(segmento);
  }

  if (!UUID.test(segmento)) return { title: "Package" };
  const offer = await getActiveOfferById(segmento).catch(() => null);
  return { title: offer ? offer.titleEn : "Package" };
}

export default async function BoostSegmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ segmento: string }>;
  searchParams: Promise<{ ref?: string; error?: string }>;
}) {
  const [{ segmento }, query] = await Promise.all([params, searchParams]);

  if (isTeamSlug(segmento)) {
    return <StorefrontPage refSlug={segmento} errorCode={query.error ?? null} />;
  }

  if (!UUID.test(segmento)) notFound();

  let offer: Awaited<ReturnType<typeof getActiveOfferById>> = null;
  let raids: ShowcaseRaid[] = [];
  try {
    const [offerData, showcase] = await Promise.all([
      getActiveOfferById(segmento),
      getSeasonShowcase().catch((err) => {
        console.error("No se pudo cargar el escaparate de la temporada:", err);
        return [] as ShowcaseRaid[];
      }),
    ]);
    offer = offerData;
    raids = showcase;
  } catch (err) {
    console.error("No se pudo cargar el paquete de boost:", err);
  }
  if (!offer) notFound();

  const delPaquete = raidsForOffer(raids, offer);
  const raidsArte = delPaquete.length > 0 ? (delPaquete as ShowcaseRaid[]) : raids;

  return (
    <BoostOfferClient
      offer={offer}
      raids={raidsArte}
      refSlug={query.ref ?? null}
      formToken={issueFormToken()}
    />
  );
}
