import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getCurrentAppUserId } from "@/lib/current-app-user";
import GruposMiticosClient from "./GruposMiticosClient";

export const metadata = { title: "Grupos M+" };

export default async function GruposMiticosPage() {
  const session = await auth();
  const appRole = session?.user?.appRole;
  const canManage = appRole === "admin" || appRole === "manager";

  const supabase = createServerSupabaseClient();
  const myUserId = await getCurrentAppUserId(supabase, session?.user);

  return (
    <main className="py-10">
      <GruposMiticosClient canManage={canManage} myUserId={myUserId} />
    </main>
  );
}
