import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import BinanceClient from "./BinanceClient";

export const metadata = { title: "Binance" };

export default async function BinancePage() {
  const session = await auth();
  const supabase = createServerSupabaseClient();

  const { data } = await supabase
    .from("app_users")
    .select("binance_id")
    .eq("discord_id", session?.user?.discordId ?? "")
    .maybeSingle();

  return (
    <main className="portal-container is-narrow py-10">
      <BinanceClient initialBinanceId={data?.binance_id ?? null} />
    </main>
  );
}
