import { nextRotationAt } from "@/lib/boost-deals";
import { getActiveOffers, getListedSlots, getSeasonShowcase, type ShowcaseRaid } from "@/lib/boost-store";
import { getStorefrontRaider, type StorefrontRaider } from "@/lib/boost-links";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import BoostStorefront from "./BoostStorefront";

export interface StorefrontPageProps {
  refSlug: string | null;
  errorCode: string | null;
}

export default async function StorefrontPage({ refSlug, errorCode }: StorefrontPageProps) {
  let offers: Awaited<ReturnType<typeof getActiveOffers>> = [];
  let openRuns = 0;
  let raids: ShowcaseRaid[] = [];
  let raider: StorefrontRaider | null = null;
  try {
    const [offersData, slots, showcase, advData] = await Promise.all([
      getActiveOffers(),
      getListedSlots(),
      getSeasonShowcase().catch((err) => {
        console.error("No se pudo cargar el escaparate de la temporada:", err);
        return [] as ShowcaseRaid[];
      }),
      getStorefrontRaider(createServerSupabaseClient(), refSlug).catch((err) => {
        console.error("No se pudo resolver el ADV de la tienda:", err);
        return null;
      }),
    ]);
    offers = offersData;
    openRuns = slots.filter((s) => s.spotsLeft > 0).length;
    raids = showcase;
    raider = advData;
  } catch (err) {
    console.error("No se pudo cargar el catálogo público de boosts:", err);
  }

  return (
    <BoostStorefront
      offers={offers}
      openRuns={openRuns}
      dealsRotateAt={nextRotationAt().toISOString()}
      raids={raids}
      raider={raider}
      refSlug={refSlug}
      errorCode={errorCode}
    />
  );
}
