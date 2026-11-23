import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { refreshCharacters } from "@/lib/refresh-characters";
import { refreshWclLockouts } from "@/lib/wcl-lockouts";
import { getCurrentRaidCatalog } from "@/lib/raid-catalog";
import { getRemovedUserIds } from "@/lib/removed-members";
import { getFriendUserIds } from "@/lib/friend-members";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const expected = process.env.CRON_SECRET;

  if (!expected) {
    return NextResponse.json(
      { error: "CRON_SECRET no está configurado en el servidor" },
      { status: 500 }
    );
  }

  if (authHeader !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const supabase = createServerSupabaseClient();
  const [{ data: characters, error }, removedUserIds, friendUserIds] = await Promise.all([
    supabase.from("characters").select("*"),
    getRemovedUserIds(supabase),
    getFriendUserIds(supabase),
  ]);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const activeCharacters = (characters ?? [])
    .filter((c) => !removedUserIds.has(c.user_id))
    .map((c) => ({ ...c, owner_is_friend: friendUserIds.has(c.user_id) }));

  const results = await refreshCharacters(supabase, activeCharacters, "all");

  let wclLockouts = null;
  try {
    const { wclManualRefreshRaidKeys } = await getCurrentRaidCatalog(supabase);
    wclLockouts = await refreshWclLockouts(supabase, wclManualRefreshRaidKeys);
  } catch (wclErr) {
    console.error("Error refrescando lockouts vía WCL en el cron:", wclErr);
  }

  return NextResponse.json({ updated: results.length, results, wclLockouts });
}
