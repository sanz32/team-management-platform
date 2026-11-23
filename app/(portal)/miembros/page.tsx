import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import MiembrosClient from "./MiembrosClient";

export const metadata = { title: "Miembros" };

export default async function MiembrosPage() {
  const session = await auth();
  const appRole = session?.user?.appRole;
  const canManage = appRole === "admin" || appRole === "manager";
  const isAdmin = appRole === "admin";

  let ownUserId: string | null = null;
  if (canManage && session?.user?.discordId) {
    const supabase = createServerSupabaseClient();
    const { data } = await supabase
      .from("app_users")
      .select("id")
      .eq("discord_id", session.user.discordId)
      .maybeSingle();
    ownUserId = data?.id ?? null;
  }

  return (
    <main className="portal-container is-wide py-10">
      <MiembrosClient canManage={canManage} isAdmin={isAdmin} ownUserId={ownUserId} />
    </main>
  );
}
