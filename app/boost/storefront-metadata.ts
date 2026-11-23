import type { Metadata } from "next";
import { getStorefrontRaider } from "@/lib/boost-links";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { teamBrand } from "@/lib/boost-teams";

export async function storefrontMetadata(refSlug: string | null): Promise<Metadata> {
  const raider = await getStorefrontRaider(createServerSupabaseClient(), refSlug).catch(() => null);
  const marca = teamBrand(raider?.teamName);

  const title = `${marca} — WoW Raid Boosts`;
  const description = `${marca} · Normal, Heroic and Mythic raid boosts, paid in in-game gold. We never ask for real-money payments.`;

  return {
    title: { absolute: title },
    description,
    openGraph: {
      title,
      description,
      images: ["/brand/banner.svg"],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}
