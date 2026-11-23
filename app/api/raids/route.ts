import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getCurrentRaidCatalog } from "@/lib/raid-catalog";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const supabase = createServerSupabaseClient();
  const catalog = await getCurrentRaidCatalog(supabase);

  return NextResponse.json({
    raids: catalog.raids,
    encounterToBoss: catalog.encounterToBoss,
  });
}
