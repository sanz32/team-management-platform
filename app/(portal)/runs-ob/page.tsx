import { auth } from "@/lib/auth";
import RunsOBClient from "./RunsOBClient";

export const metadata = { title: "Runs OB" };

export default async function RunsOBPage() {
  const session = await auth();
  const appRole = session?.user?.appRole;
  const canManage = appRole === "admin" || appRole === "manager";

  return (
    <main className="portal-container is-wide py-10">
      <RunsOBClient canManage={canManage} />
    </main>
  );
}
