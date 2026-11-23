import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import CuentasClient from "./CuentasClient";

export const metadata = { title: "Cuentas" };

export default async function CuentasPage() {
  const session = await auth();
  const appRole = session?.user?.appRole;

  const supabase = createServerSupabaseClient();

  let wclConnection: { wcl_user_name: string | null } | null = null;
  if (appRole === "admin") {
    const { data } = await supabase
      .from("wcl_oauth_tokens")
      .select("wcl_user_name, updated_at")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    wclConnection = data ?? null;
  }

  return (
    <main className="portal-container is-narrow py-10">
      <CuentasClient
        showWcl={appRole === "admin"}
        wclConnectedAs={wclConnection?.wcl_user_name ?? null}
        wclConnected={!!wclConnection}
      />
    </main>
  );
}
