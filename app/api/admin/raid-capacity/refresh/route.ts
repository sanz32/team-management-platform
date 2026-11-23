import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getCurrentAppUserId } from "@/lib/current-app-user";
import { computeRaidCapacityEntries } from "@/lib/raid-capacity-compute";
import { saveRaidCapacitySnapshot } from "@/lib/raid-capacity-snapshot";

export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const appRole = session.user.appRole;
  if (appRole !== "admin" && appRole !== "manager") {
    return NextResponse.json({ error: "Solo el líder o los managers pueden actualizar esto" }, { status: 403 });
  }

  const supabase = createServerSupabaseClient();
  const { entries, error } = await computeRaidCapacityEntries(supabase);
  if (error) return NextResponse.json({ error }, { status: 500 });

  const computedBy = await getCurrentAppUserId(supabase, session.user);
  const saveError = await saveRaidCapacitySnapshot(supabase, entries, computedBy);
  if (saveError) return NextResponse.json({ error: saveError }, { status: 500 });

  return NextResponse.json({ entries, computedAt: new Date().toISOString() });
}
