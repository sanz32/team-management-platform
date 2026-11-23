import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { canManageBoostCatalog } from "@/lib/boost-links";
import { offerKey, parseBoostCatalog } from "@/lib/boost-import";
import { BOOST_CATALOG_TAG } from "@/lib/boost-store";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  if (!canManageBoostCatalog(session.user.appRole)) {
    return NextResponse.json({ error: "Solo admin o manager pueden editar el catálogo" }, { status: 403 });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as { text?: unknown };
    const text = typeof body.text === "string" ? body.text : "";
    if (!text.trim()) {
      return NextResponse.json({ error: "No pegaste nada" }, { status: 400 });
    }

    const { offers: parsed, warnings } = parseBoostCatalog(text);
    if (parsed.length === 0) {
      return NextResponse.json(
        { error: "No se reconoció ningún paquete en ese texto", warnings },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();
    const { data: existing, error: readError } = await supabase
      .from("boost_offers")
      .select("id, category, group_label, title_en, description_en, price_gold, badge");

    if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });

    const byKey = new Map(
      (existing ?? []).map((row) => [
        offerKey({ category: row.category, groupLabel: row.group_label ?? "", titleEn: row.title_en }),
        row,
      ])
    );

    const nuevos: Record<string, unknown>[] = [];
    const cambios: { id: string; patch: Record<string, unknown> }[] = [];
    let sinCambios = 0;

    for (const offer of parsed) {
      const found = byKey.get(offerKey(offer));

      if (!found) {
        nuevos.push({
          category: offer.category,
          group_label: offer.groupLabel,
          title_en: offer.titleEn,
          title_es: offer.titleEn,
          description_en: offer.descriptionEn || null,
          description_es: offer.descriptionEn || null,
          price_gold: offer.priceGold,
          badge: offer.badge,
          is_active: true,
        });
        continue;
      }

      const patch: Record<string, unknown> = {};
      if (Number(found.price_gold) !== offer.priceGold) patch.price_gold = offer.priceGold;
      if ((found.description_en ?? "") !== offer.descriptionEn) {
        patch.description_en = offer.descriptionEn || null;
      }
      if ((found.badge ?? null) !== offer.badge) patch.badge = offer.badge;

      if (Object.keys(patch).length === 0) {
        sinCambios += 1;
        continue;
      }
      patch.updated_at = new Date().toISOString();
      cambios.push({ id: found.id, patch });
    }

    if (nuevos.length > 0) {
      const { error } = await supabase.from("boost_offers").insert(nuevos);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    for (const { id, patch } of cambios) {
      const { error } = await supabase.from("boost_offers").update(patch).eq("id", id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    revalidateTag(BOOST_CATALOG_TAG, { expire: 0 });

    return NextResponse.json({
      ok: true,
      creados: nuevos.length,
      actualizados: cambios.length,
      sinCambios,
      noVinieron: (existing ?? []).length - (cambios.length + sinCambios),
      warnings,
    });
  } catch (err) {
    console.error("Error importando el catálogo de boosts:", err);
    return NextResponse.json({ error: "No se pudo importar el catálogo" }, { status: 500 });
  }
}
