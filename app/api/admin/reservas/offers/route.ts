import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import type { Session } from "next-auth";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { isBoostCategory } from "@/lib/boost";
import { canManageBoostCatalog, canWipeBoostCatalog } from "@/lib/boost-links";
import { BOOST_CATALOG_TAG } from "@/lib/boost-store";

const COLUMNS =
  "id, category, group_label, title_en, title_es, description_en, description_es, price_gold, badge, image_url, is_active, created_at";

function denied(session: Session | null): NextResponse | null {
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!canManageBoostCatalog(session.user.appRole)) {
    return NextResponse.json({ error: "Solo admin o manager pueden editar el catálogo" }, { status: 403 });
  }
  return null;
}

export async function GET() {
  const session = await auth();
  const blocked = denied(session);
  if (blocked) return blocked;

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("boost_offers")
    .select(COLUMNS)
    .order("category")
    .order("price_gold");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ offers: data ?? [] });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  const blocked = denied(session);
  if (blocked) return blocked;

  try {
    const body = (await req.json()) as Record<string, unknown>;

    const category = body.category;
    const titleEn = typeof body.title_en === "string" ? body.title_en.trim() : "";
    const priceGold = Number(body.price_gold);

    if (!isBoostCategory(category)) {
      return NextResponse.json({ error: "Dificultad inválida" }, { status: 400 });
    }
    if (!titleEn) {
      return NextResponse.json({ error: "El título en inglés es obligatorio" }, { status: 400 });
    }
    if (!Number.isFinite(priceGold) || priceGold < 0) {
      return NextResponse.json({ error: "El precio en oro tiene que ser un número" }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from("boost_offers")
      .insert({
        category,
        group_label: typeof body.group_label === "string" ? body.group_label.trim() : "",
        title_en: titleEn,
        title_es: typeof body.title_es === "string" && body.title_es.trim() ? body.title_es.trim() : titleEn,
        description_en: typeof body.description_en === "string" ? body.description_en.trim() || null : null,
        description_es: typeof body.description_es === "string" ? body.description_es.trim() || null : null,
        price_gold: Math.round(priceGold),
        badge: typeof body.badge === "string" && body.badge.trim() ? body.badge.trim() : null,
        image_url: typeof body.image_url === "string" && body.image_url.trim() ? body.image_url.trim() : null,
        is_active: body.is_active !== false,
      })
      .select(COLUMNS)
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    revalidateTag(BOOST_CATALOG_TAG, { expire: 0 });
    return NextResponse.json({ offer: data });
  } catch (err) {
    console.error("Error creando la oferta:", err);
    return NextResponse.json({ error: "No se pudo crear la oferta" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!canWipeBoostCatalog(session.user.appRole)) {
    return NextResponse.json(
      { error: "Solo un admin puede vaciar el catálogo completo" },
      { status: 403 }
    );
  }

  try {
    const body = (await req.json().catch(() => ({}))) as { confirm?: unknown };
    if (body.confirm !== "TODOS") {
      return NextResponse.json(
        { error: "Falta la confirmación para vaciar el catálogo" },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from("boost_offers")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000")
      .select("id");

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    revalidateTag(BOOST_CATALOG_TAG, { expire: 0 });
    return NextResponse.json({ ok: true, deleted: (data ?? []).length });
  } catch (err) {
    console.error("Error vaciando el catálogo de boosts:", err);
    return NextResponse.json({ error: "No se pudo vaciar el catálogo" }, { status: 500 });
  }
}
