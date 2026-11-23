import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { selectAllRows } from "@/lib/cooldown-planner/paginate";
import { CooldownSpell } from "@/lib/cooldown-planner/types";

interface SpellRow {
  spell_id: number;
  name: string;
  icon_url: string | null;
  class: string;
  spec: string | null;
  category: CooldownSpell["category"];
  duration_seconds: number | null;
  is_active: boolean;
  is_categorized: boolean;
  source: CooldownSpell["source"];
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const uncategorizedOnly = searchParams.get("uncategorized") === "true";
  const categorizedOnly = searchParams.get("categorized") === "true";

  const supabase = createServerSupabaseClient();
  let data: SpellRow[];
  try {
    data = await selectAllRows<SpellRow>((from, to) => {
      let query = supabase
        .from("cooldown_spell_library")
        .select("spell_id, name, icon_url, class, spec, category, duration_seconds, is_active, is_categorized, source")
        .eq("is_active", true)
        .order("class")
        .order("name")
        .range(from, to);
      if (uncategorizedOnly) query = query.eq("is_categorized", false);
      if (categorizedOnly) query = query.eq("is_categorized", true);
      return query;
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  const spells: CooldownSpell[] = data.map((s) => ({
    spellId: s.spell_id,
    name: s.name,
    iconUrl: s.icon_url,
    class: s.class,
    spec: s.spec,
    category: s.category,
    durationSeconds: s.duration_seconds,
    isActive: s.is_active,
    isCategorized: s.is_categorized,
    source: s.source,
  }));

  return NextResponse.json({ spells });
}
