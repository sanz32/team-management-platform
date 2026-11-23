import { auth } from "@/lib/auth";
import CooldownPlannerClient from "./CooldownPlannerClient";

export const metadata = { title: "Cooldown Planner" };

export default async function CooldownPlannerPage() {
  const session = await auth();
  const appRole = session?.user?.appRole;
  const canManage = appRole === "admin" || appRole === "manager";

  return (
    <main className="portal-container is-wide py-10">
      <CooldownPlannerClient canManage={canManage} />
    </main>
  );
}
