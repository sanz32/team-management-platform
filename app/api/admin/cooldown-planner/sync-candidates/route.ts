import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { syncCooldownSpellCandidates } from "@/lib/cooldown-planner/spell-library-sync";

export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  if (session.user.appRole !== "admin" && session.user.appRole !== "manager") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  try {
    const region = process.env.BLIZZARD_REGION || "us";
    const supabase = createServerSupabaseClient();
    const result = await syncCooldownSpellCandidates(supabase, region);
    return NextResponse.json(result);
  } catch (err) {
    console.error("Error sincronizando la librería de cooldowns:", err);
    const message = err instanceof Error ? err.message : "Error desconocido sincronizando la librería.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
