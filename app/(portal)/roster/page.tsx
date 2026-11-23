import { auth } from "@/lib/auth";
import RosterClient from "./RosterClient";

export const metadata = { title: "Roster" };

export default async function RosterPage() {
  const session = await auth();
  const appRole = session?.user?.appRole;
  const canManage = appRole === "admin" || appRole === "manager";
  const canGenerate = canManage || appRole === "guest";

  return (
    <main className="portal-container is-wide py-10">
      <RosterClient canManage={canManage} canGenerate={canGenerate} />
    </main>
  );
}
