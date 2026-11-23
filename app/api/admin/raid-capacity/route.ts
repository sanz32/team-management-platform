import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getRaidCapacitySnapshot, saveRaidCapacitySnapshot } from "@/lib/raid-capacity-snapshot";
import { computeRaidCapacityEntries } from "@/lib/raid-capacity-compute";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const appRole = session.user.appRole;
  if (
    appRole !== "admin" &&
    appRole !== "manager" &&
    appRole !== "guest" &&
    appRole !== "member"
  ) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const supabase = createServerSupabaseClient();
  const snapshot = await getRaidCapacitySnapshot(supabase);

  if (snapshot.computedAt) {
    return NextResponse.json({ entries: snapshot.entries, computedAt: snapshot.computedAt });
  }

  const { entries, error } = await computeRaidCapacityEntries(supabase);
  if (error) return NextResponse.json({ error }, { status: 500 });

  const saveError = await saveRaidCapacitySnapshot(supabase, entries, null);
  if (saveError) return NextResponse.json({ error: saveError }, { status: 500 });

  return NextResponse.json({ entries, computedAt: new Date().toISOString() });
}
