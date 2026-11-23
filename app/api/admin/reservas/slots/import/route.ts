import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { canManageBoostCatalog } from "@/lib/boost-links";
import { isWithinSchedulingWindow } from "@/lib/boost";
import { parseBoostSchedule } from "@/lib/boost-import";
import { applyParsedSlots } from "@/lib/boost-schedule-sync";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  if (!canManageBoostCatalog(session.user.appRole)) {
    return NextResponse.json({ error: "Solo admin o manager pueden editar los horarios" }, { status: 403 });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as { text?: unknown };
    const text = typeof body.text === "string" ? body.text : "";
    if (!text.trim()) {
      return NextResponse.json({ error: "No pegaste nada" }, { status: 400 });
    }

    const { slots: parsed, warnings } = parseBoostSchedule(text);

    const dentro = parsed.filter((s) => isWithinSchedulingWindow(new Date(s.scheduledAt)));
    const fuera = parsed.length - dentro.length;
    if (fuera > 0) {
      warnings.push(
        `${fuera} run(s) quedaron fuera de la semana en curso y la siguiente, no se agendaron.`
      );
    }

    if (dentro.length === 0) {
      return NextResponse.json(
        { error: "No se reconoció ninguna run agendable en ese texto", warnings },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();
    const result = await applyParsedSlots(supabase, dentro);

    return NextResponse.json({
      ok: true,
      creados: result.creados,
      actualizados: result.actualizados,
      sinCambios: result.sinCambios,
      warnings: [...warnings, ...result.warnings],
    });
  } catch (err) {
    console.error("Error importando la agenda de boosts:", err);
    return NextResponse.json({ error: "No se pudo importar la agenda" }, { status: 500 });
  }
}
