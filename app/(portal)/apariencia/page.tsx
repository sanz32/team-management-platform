import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getCurrentAppUserId } from "@/lib/current-app-user";
import AparienciaClient from "./AparienciaClient";

export const metadata = { title: "Apariencia" };

export default async function AparienciaPage() {
  const session = await auth();
  const supabase = createServerSupabaseClient();
  const appUserId = await getCurrentAppUserId(supabase, session?.user);

  let initialColor1: string | null = null;
  let initialColor2: string | null = null;
  let initialNameStyle: string | null = null;
  let hasApp = false;

  if (appUserId) {
    const [{ data: prefs }, { data: token }] = await Promise.all([
      supabase
        .from("app_users")
        .select("frame_color_1, frame_color_2, frame_name_style")
        .eq("id", appUserId)
        .maybeSingle(),
      supabase.from("sync_tokens").select("user_id").eq("user_id", appUserId).maybeSingle(),
    ]);
    initialColor1 = prefs?.frame_color_1 ?? null;
    initialColor2 = prefs?.frame_color_2 ?? null;
    initialNameStyle = prefs?.frame_name_style ?? null;
    hasApp = Boolean(token);
  }

  return (
    <main className="portal-container is-narrow py-10">
      <AparienciaClient
        userId={appUserId ?? "preview"}
        discordUsername={session?.user?.nickname || session?.user?.name || "Vos"}
        avatarUrl={session?.user?.image ?? null}
        initialColor1={initialColor1}
        initialColor2={initialColor2}
        initialNameStyle={initialNameStyle}
        hasApp={hasApp}
      />
    </main>
  );
}
