import { NextRequest, NextResponse, after } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { isWithinSchedulingWindow } from "@/lib/boost";
import { parseBoostRunsJson } from "@/lib/boost-import";
import { applyParsedSlots } from "@/lib/boost-schedule-sync";
import { markRefreshSynced } from "@/lib/boost-refresh-signal";
import { pruneExpiredSlots } from "@/lib/boost-prune";

interface SyncDay {
  date?: unknown;
  payload?: unknown;
}

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

const MAX_DAYS = 31;

export async function POST(req: NextRequest) {
  const secret = process.env.BOOST_SYNC_SECRET;
  if (!secret) {
    console.warn("BOOST_SYNC_SECRET no está configurada: /api/boost/schedule/sync rechaza todo.");
    return NextResponse.json({ error: "Sincronización no configurada" }, { status: 503 });
  }
  if (req.headers.get("x-boost-sync-secret") !== secret) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as { days?: unknown };
    const days = Array.isArray(body.days) ? (body.days as SyncDay[]) : null;
    if (!days || days.length === 0) {
      return NextResponse.json({ error: "No llegó ningún día" }, { status: 400 });
    }
    if (days.length > MAX_DAYS) {
      return NextResponse.json({ error: `Máximo ${MAX_DAYS} días por sincronización` }, { status: 400 });
    }

    const warnings: string[] = [];
    const parsed = [];
    const syncedDates: string[] = [];

    for (const day of days) {
      const date = typeof day?.date === "string" && DATE_KEY.test(day.date) ? day.date : null;
      if (!date) {
        warnings.push(`Se ignoró un día con fecha ilegible ("${String(day?.date)}").`);
        continue;
      }
      const { slots, warnings: propias } = parseBoostRunsJson(day.payload);
      warnings.push(...propias.map((w) => `${date}: ${w}`));
      parsed.push(...slots);
      syncedDates.push(date);
    }

    if (syncedDates.length === 0) {
      return NextResponse.json({ error: "Ningún día tenía una fecha válida", warnings }, { status: 400 });
    }

    const dentro = parsed.filter((s) => isWithinSchedulingWindow(new Date(s.scheduledAt)));
    const fuera = parsed.length - dentro.length;
    if (fuera > 0) {
      warnings.push(`${fuera} run(s) quedaron fuera de la ventana de agendado, no se guardaron.`);
    }

    const supabase = createServerSupabaseClient();
    const result = await applyParsedSlots(supabase, dentro, syncedDates);
    await markRefreshSynced(supabase);

    after(() => pruneExpiredSlots());

    return NextResponse.json({
      ok: true,
      dias: syncedDates.length,
      corridas: dentro.length,
      creados: result.creados,
      actualizados: result.actualizados,
      sinCambios: result.sinCambios,
      desactivados: result.desactivados,
      warnings: [...warnings, ...result.warnings],
    });
  } catch (err) {
    console.error("Error sincronizando la agenda de boosts:", err);
    return NextResponse.json({ error: "No se pudo sincronizar la agenda" }, { status: 500 });
  }
}
