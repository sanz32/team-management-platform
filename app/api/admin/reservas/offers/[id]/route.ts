import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import type { Session } from "next-auth";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { isBoostCategory } from "@/lib/boost";
import { canManageBoostCatalog } from "@/lib/boost-links";
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

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const blocked = denied(session);
  if (blocked) return blocked;

  try {
    const { id } = await params;
    const body = (await req.json()) as Record<string, unknown>;
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (body.category !== undefined) {
      if (!isBoostCategory(body.category)) {
        return NextResponse.json({ error: "Dificultad inválida" }, { status: 400 });
      }
      patch.category = body.category;
    }
    if (typeof body.group_label === "string") patch.group_label = body.group_label.trim();
    if (typeof body.title_en === "string") {
      if (!body.title_en.trim()) {
        return NextResponse.json({ error: "El título en inglés es obligatorio" }, { status: 400 });
      }
      patch.title_en = body.title_en.trim();
    }
    if (typeof body.title_es === "string") patch.title_es = body.title_es.trim() || patch.title_en || undefined;
    if (typeof body.description_en === "string") patch.description_en = body.description_en.trim() || null;
    if (typeof body.description_es === "string") patch.description_es = body.description_es.trim() || null;
    if (body.price_gold !== undefined) {
      const price = Number(body.price_gold);
      if (!Number.isFinite(price) || price < 0) {
        return NextResponse.json({ error: "El precio en oro tiene que ser un número" }, { status: 400 });
      }
      patch.price_gold = Math.round(price);
    }
    if (body.badge !== undefined) {
      patch.badge = typeof body.badge === "string" && body.badge.trim() ? body.badge.trim() : null;
    }
    if (body.image_url !== undefined) {
      patch.image_url = typeof body.image_url === "string" && body.image_url.trim() ? body.image_url.trim() : null;
    }
    if (typeof body.is_active === "boolean") patch.is_active = body.is_active;

    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from("boost_offers")
      .update(patch)
      .eq("id", id)
      .select(COLUMNS)
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    revalidateTag(BOOST_CATALOG_TAG, { expire: 0 });
    return NextResponse.json({ offer: data });
  } catch (err) {
    console.error("Error editando la oferta:", err);
    return NextResponse.json({ error: "No se pudo guardar la oferta" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const blocked = denied(session);
  if (blocked) return blocked;

  const { id } = await params;
  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("boost_offers").delete().eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  revalidateTag(BOOST_CATALOG_TAG, { expire: 0 });
  return NextResponse.json({ ok: true });
}
