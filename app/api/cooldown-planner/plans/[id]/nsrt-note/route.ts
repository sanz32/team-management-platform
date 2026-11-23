import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { resolvePlanForNsrtExport, PlanNotFoundError } from "@/lib/cooldown-planner/nsrt-export";
import { generateNsrtBossNote } from "@/lib/export/nsrt-note";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { id } = await params;
  const supabase = createServerSupabaseClient();

  try {
    const input = await resolvePlanForNsrtExport(supabase, id);
    return NextResponse.json({ note: generateNsrtBossNote(input) });
  } catch (err) {
    if (err instanceof PlanNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    const message = err instanceof Error ? err.message : "No se pudo generar la nota.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
