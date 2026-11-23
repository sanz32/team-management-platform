import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export interface WishlistBoss {
  id: string;
  name: string;
  orderIndex: number;
  imageUrl: string | null;
}

export interface WishlistSeason {
  id: string;
  name: string;
  syncedAt: string | null;
  bosses: WishlistBoss[];
}

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const supabase = createServerSupabaseClient();

  const { data: season, error: seasonError } = await supabase
    .from("raid_seasons")
    .select("id, name, synced_at")
    .eq("is_current", true)
    .maybeSingle();

  if (seasonError) return NextResponse.json({ error: seasonError.message }, { status: 500 });
  if (!season) {
    return NextResponse.json({ season: null });
  }

  const { data: bosses, error: bossesError } = await supabase
    .from("raid_bosses")
    .select("id, name, order_index, image_url")
    .eq("season_id", season.id)
    .order("order_index", { ascending: true });

  if (bossesError) return NextResponse.json({ error: bossesError.message }, { status: 500 });

  const result: WishlistSeason = {
    id: season.id,
    name: season.name,
    syncedAt: season.synced_at,
    bosses: (bosses ?? []).map((b) => ({
      id: b.id,
      name: b.name,
      orderIndex: b.order_index,
      imageUrl: b.image_url,
    })),
  };

  return NextResponse.json({ season: result });
}
