import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { ROSTER_TIERS, type CharacterTier } from "@/lib/roster-tiers";

function isTier(value: unknown): value is CharacterTier {
  return typeof value === "string" && (ROSTER_TIERS as readonly string[]).includes(value);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const appRole = session.user.appRole;
  if (appRole !== "admin" && appRole !== "manager") {
    return NextResponse.json(
      { error: "Solo el líder o los managers pueden cambiar esto" },
      { status: 403 }
    );
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const { tier, note } = body as { tier?: unknown; note?: unknown };

  if (!isTier(tier)) {
    return NextResponse.json({ error: "Prioridad de roster desconocida" }, { status: 400 });
  }
  if (note != null && typeof note !== "string") {
    return NextResponse.json({ error: "La nota debe ser texto" }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("characters")
    .update({ roster_tier: tier, roster_note: note?.trim() || null })
    .eq("id", id)
    .select("id, roster_tier, roster_note")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    id: data.id,
    rosterTier: data.roster_tier,
    rosterNote: data.roster_note,
  });
}
