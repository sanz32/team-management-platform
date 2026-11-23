import { auth } from "@/lib/auth";
import BalanceClient from "./BalanceClient";

export const metadata = { title: "Balance" };

export default async function BalancePage({
  searchParams,
}: {
  searchParams: Promise<{ panel?: string }>;
}) {
  const session = await auth();
  const appRole = session?.user?.appRole;
  const { panel } = await searchParams;
  const canViewAdmin = appRole === "admin" || appRole === "manager" || appRole === "guest";
  const showObBalance = appRole !== "guest";
  const canManagePayouts = appRole === "admin" || appRole === "manager";

  return (
    <BalanceClient
      canViewAdmin={canViewAdmin}
      showObBalance={showObBalance}
      canManagePayouts={canManagePayouts}
      initialPanel={panel}
    />
  );
}
