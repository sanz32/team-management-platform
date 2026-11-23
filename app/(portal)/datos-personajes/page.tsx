import Script from "next/script";
import { auth } from "@/lib/auth";
import DatosPersonajesClient from "./DatosPersonajesClient";

export const metadata = { title: "Datos de los personajes" };

export default async function DatosPersonajesPage() {
  const session = await auth();
  const appRole = session?.user?.appRole;
  const canSeeAll =
    appRole === "admin" || appRole === "manager" || appRole === "guest" || appRole === "member";

  return (
    <main className="portal-container is-wide py-10">
      <Script src="https://wow.zamimg.com/widgets/power.js" strategy="afterInteractive" />
      <DatosPersonajesClient canSeeAll={canSeeAll} />
    </main>
  );
}
