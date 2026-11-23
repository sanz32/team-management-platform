import { auth } from "@/lib/auth";
import AdminSpellLibraryClient from "./AdminSpellLibraryClient";

export const metadata = { title: "Biblioteca de hechizos" };

export default async function CooldownPlannerAdminPage() {
  const session = await auth();
  const appRole = session?.user?.appRole;
  const canManage = appRole === "admin" || appRole === "manager";

  if (!canManage) {
    return (
      <main className="portal-container py-10">
        <p className="text-ink-muted">No autorizado.</p>
      </main>
    );
  }

  return (
    <main className="portal-container py-10">
      <AdminSpellLibraryClient />
    </main>
  );
}
