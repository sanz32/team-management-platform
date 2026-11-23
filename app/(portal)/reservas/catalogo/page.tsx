import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { canManageBoostCatalog, canWipeBoostCatalog } from "@/lib/boost-links";
import CatalogoClient from "./CatalogoClient";

export const metadata = { title: "Catálogo de boosts" };

export default async function CatalogoPage() {
  const session = await auth();
  if (!canManageBoostCatalog(session?.user?.appRole)) redirect("/reservas");

  return (
    <main className="py-10">
      <CatalogoClient canWipe={canWipeBoostCatalog(session?.user?.appRole)} />
    </main>
  );
}
