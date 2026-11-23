import Script from "next/script";
import { auth } from "@/lib/auth";
import WishlistClient from "./WishlistClient";

export const metadata = { title: "Wishlist" };

export default async function WishlistPage({
  searchParams,
}: {
  searchParams: Promise<{ panel?: string; view?: string }>;
}) {
  const session = await auth();
  const appRole = session?.user?.appRole;
  const canManage = appRole === "admin" || appRole === "manager";
  const { panel, view } = await searchParams;

  return (
    <>
      <Script src="https://wow.zamimg.com/widgets/power.js" strategy="afterInteractive" />
      <main className="portal-container is-wide py-10">
        <WishlistClient canManage={canManage} initialPanel={panel} initialViewAll={view === "all"} />
      </main>
    </>
  );
}
