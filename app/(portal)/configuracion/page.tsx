import { auth } from "@/lib/auth";
import SyncSeasonPanel from "@/app/components/SyncSeasonPanel";
import { Settings } from "lucide-react";
import PageHeader from "@/app/components/PageHeader";

export const metadata = { title: "Configuración" };

export default async function ConfiguracionPage() {
  const session = await auth();
  const appRole = session?.user?.appRole;
  const canManage = appRole === "admin" || appRole === "manager";

  if (!canManage) {
    return (
      <main className="portal-container is-narrow py-10">
        <p className="text-ink-muted">No autorizado.</p>
      </main>
    );
  }

  return (
    <main className="portal-container is-narrow py-10">
      <PageHeader
        eyebrow="Gestión"
        icon={Settings}
        title="Configuración"
        description="Ajustes globales que comparten todos los módulos del portal."
      />
      <SyncSeasonPanel />
    </main>
  );
}
