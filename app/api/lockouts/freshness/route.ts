import { after } from "next/server";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getLockoutFreshness, refreshWclLockoutsIfStale } from "@/lib/lockout-freshness";
import { refreshFriendLockoutsIfStale } from "@/lib/friend-lockout-freshness";
import { getCurrentRaidCatalog, findMissingEncounterMappings } from "@/lib/raid-catalog";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const supabase = createServerSupabaseClient();

  after(() => refreshWclLockoutsIfStale(supabase));

  if (session.user.appRole === "friend" && session.user.appUserId) {
    const friendAppUserId = session.user.appUserId;
    after(() => refreshFriendLockoutsIfStale(supabase, friendAppUserId));
  }

  const [freshness, catalog] = await Promise.all([
    getLockoutFreshness(supabase),
    getCurrentRaidCatalog(supabase),
  ]);

  return NextResponse.json({
    ...freshness,
    missingEncounters: findMissingEncounterMappings(catalog),
  });
}
