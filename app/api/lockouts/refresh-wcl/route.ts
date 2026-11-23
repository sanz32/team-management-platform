import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { refreshWclLockouts } from "@/lib/wcl-lockouts";
import { getCurrentRaidCatalog } from "@/lib/raid-catalog";
import { WclRateLimitError, WclReauthRequiredError } from "@/lib/wcl";

export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const supabase = createServerSupabaseClient();

  try {
    const { wclManualRefreshRaidKeys } = await getCurrentRaidCatalog(supabase);
    const result = await refreshWclLockouts(supabase, wclManualRefreshRaidKeys);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof WclRateLimitError) {
      return NextResponse.json({ error: err.message }, { status: 429 });
    }
    if (err instanceof WclReauthRequiredError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    const message = err instanceof Error ? err.message : "Error consultando Warcraft Logs";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
