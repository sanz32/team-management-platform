import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { canManageBoostCatalog } from "@/lib/boost-links";
import { suggestTemplates, type TemplateSlot } from "@/lib/boost-slot-templates";

const MODEL_LOOKBACK_DAYS = 7;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  if (!canManageBoostCatalog(session.user.appRole)) {
    return NextResponse.json(
      { error: "Solo admin o manager pueden editar los horarios" },
      { status: 403 }
    );
  }

  try {
    const body = (await req.json().catch(() => ({}))) as { slotIds?: unknown };
    const pedidos = Array.isArray(body.slotIds)
      ? new Set(body.slotIds.filter((v): v is string => typeof v === "string" && v.length > 0))
      : null;

    const supabase = createServerSupabaseClient();
    const since = new Date(Date.now() - MODEL_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from("boost_schedule_slots")
      .select("id, scheduled_at, difficulty, label, boost_slot_offers(offer_id)")
      .gte("scheduled_at", since)
      .order("scheduled_at");

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const slots: TemplateSlot[] = (
      (data ?? []) as unknown as {
        id: string;
        scheduled_at: string;
        difficulty: string;
        label: string | null;
        boost_slot_offers?: { offer_id: string }[];
      }[]
    ).map((row) => ({
      id: row.id,
      scheduledAt: row.scheduled_at,
      difficulty: row.difficulty,
      label: row.label,
      offerIds: (row.boost_slot_offers ?? []).map((o) => o.offer_id),
    }));

    const sugerencias = suggestTemplates(slots);
    const aAplicar = [...sugerencias.entries()].filter(([slotId]) => !pedidos || pedidos.has(slotId));

    if (aAplicar.length === 0) {
      return NextResponse.json({ ok: true, applied: 0, slotIds: [] });
    }

    const filas = aAplicar.flatMap(([slotId, plantilla]) =>
      plantilla.offerIds.map((offerId) => ({ slot_id: slotId, offer_id: offerId }))
    );

    const { error: insError } = await supabase.from("boost_slot_offers").insert(filas);
    if (insError) return NextResponse.json({ error: insError.message }, { status: 400 });

    return NextResponse.json({
      ok: true,
      applied: aAplicar.length,
      slotIds: aAplicar.map(([slotId]) => slotId),
    });
  } catch (err) {
    console.error("Error aplicando plantillas de contenidos:", err);
    return NextResponse.json({ error: "No se pudieron aplicar las plantillas" }, { status: 500 });
  }
}
