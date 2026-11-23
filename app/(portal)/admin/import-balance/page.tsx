import { auth } from "@/lib/auth";
import BalancePasteImport from "./BalancePasteImport";

export const metadata = { title: "Importar Balance" };

export default async function ImportBalancePage() {
  const session = await auth();
  const appRole = session?.user?.appRole;

  if (appRole !== "admin" && appRole !== "manager") {
    return (
      <main className="portal-container is-narrow py-10">
        <p className="text-ink-muted">No autorizado.</p>
      </main>
    );
  }

  return (
    <main className="portal-container is-narrow py-10">
      <BalancePasteImport />
    </main>
  );
}
