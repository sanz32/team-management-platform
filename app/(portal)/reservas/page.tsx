import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { canUseBoostLinks } from "@/lib/boost-links";
import ReservasClient from "./ReservasClient";

export const metadata = { title: "Reservas" };

export default async function ReservasPage() {
  const session = await auth();
  const appRole = session?.user?.appRole;

  if (!canUseBoostLinks(appRole)) redirect("/");

  const baseUrl = process.env.NEXTAUTH_URL ?? "";

  return (
    <main className="py-10">
      <ReservasClient canSeeAll={appRole === "admin"} baseUrl={baseUrl} />
    </main>
  );
}
