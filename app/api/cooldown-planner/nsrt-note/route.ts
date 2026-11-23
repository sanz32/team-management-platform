import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { resolvePlanForNsrtExport } from "@/lib/cooldown-planner/nsrt-export";
import { generateNsrtFullNightNote } from "@/lib/export/nsrt-note";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const planIds = (searchParams.get("planIds") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (planIds.length === 0) {
    return NextResponse.json({ error: "Falta planIds." }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const inputs = await Promise.all(
    planIds.map((planId) => resolvePlanForNsrtExport(supabase, planId).catch(() => null))
  );

  const note = generateNsrtFullNightNote(inputs.filter((i): i is NonNullable<typeof i> => i !== null));
  return NextResponse.json({ note });
}
