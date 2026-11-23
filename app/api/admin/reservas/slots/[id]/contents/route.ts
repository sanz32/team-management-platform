import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { canManageBoostCatalog } from "@/lib/boost-links";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  if (!canManageBoostCatalog(session.user.appRole)) {
    return NextResponse.json({ error: "Solo admin o manager pueden editar los horarios" }, { status: 403 });
  }

  try {
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as { offerIds?: unknown };
    const offerIds = Array.isArray(body.offerIds)
      ? [...new Set(body.offerIds.filter((v): v is string => typeof v === "string" && v.length > 0))]
      : [];

    const supabase = createServerSupabaseClient();

    const { data: slot } = await supabase
      .from("boost_schedule_slots")
      .select("id")
      .eq("id", id)
      .maybeSingle();
    if (!slot) return NextResponse.json({ error: "Ese horario no existe" }, { status: 404 });

    const { error: delError } = await supabase.from("boost_slot_offers").delete().eq("slot_id", id);
    if (delError) return NextResponse.json({ error: delError.message }, { status: 500 });

    if (offerIds.length > 0) {
      const { error: insError } = await supabase
        .from("boost_slot_offers")
        .insert(offerIds.map((offerId) => ({ slot_id: id, offer_id: offerId })));
      if (insError) return NextResponse.json({ error: insError.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, offerIds });
  } catch (err) {
    console.error("Error guardando los contenidos del horario:", err);
    return NextResponse.json({ error: "No se pudieron guardar los contenidos" }, { status: 500 });
  }
}
