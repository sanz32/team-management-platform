import type { Metadata } from "next";
import StorefrontPage from "./StorefrontPage";
import { storefrontMetadata } from "./storefront-metadata";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}): Promise<Metadata> {
  const { ref } = await searchParams;
  return storefrontMetadata(ref ?? null);
}

export default async function BoostPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string; error?: string }>;
}) {
  const params = await searchParams;

  return <StorefrontPage refSlug={params.ref ?? null} errorCode={params.error ?? null} />;
}
