import { auth } from "@/lib/auth";
import AdminBalanceClient from "./AdminBalanceClient";

export const metadata = { title: "Administrar balance" };

export default async function AdministrarBalancePage() {
  const session = await auth();
  const appRole = session?.user?.appRole;
  const canManage = appRole === "admin" || appRole === "manager";
  const canView = canManage || appRole === "guest";
  const showObBalance = appRole !== "guest";

  if (!canView) {
    return (
      <main className="portal-container py-10">
        <p className="text-ink-muted">No autorizado.</p>
      </main>
    );
  }

  return (
    <main className="portal-container py-10">
      <AdminBalanceClient canManage={canManage} showObBalance={showObBalance} />
    </main>
  );
}
