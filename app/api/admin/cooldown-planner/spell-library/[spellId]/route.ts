import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { CooldownCategory } from "@/lib/cooldown-planner/types";

const VALID_CATEGORIES: CooldownCategory[] = [
  "raid_cd",
  "external",
  "personal_defensive",
  "utility",
  "offensive",
];

export async function PATCH(request: Request, { params }: { params: Promise<{ spellId: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  if (session.user.appRole !== "admin" && session.user.appRole !== "manager") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { spellId: spellIdParam } = await params;
  const spellId = parseInt(spellIdParam, 10);
  if (!Number.isFinite(spellId)) {
    return NextResponse.json({ error: "spellId inválido." }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const category: string = typeof body?.category === "string" ? body.category : "";
  if (!VALID_CATEGORIES.includes(category as CooldownCategory)) {
    return NextResponse.json(
      { error: `Categoría inválida, debe ser una de: ${VALID_CATEGORIES.join(", ")}.` },
      { status: 400 }
    );
  }

  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("cooldown_spell_library")
    .update({ category, is_categorized: true })
    .eq("spell_id", spellId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
