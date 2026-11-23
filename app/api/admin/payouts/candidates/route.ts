import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getPayoutCandidatesForRuns } from "@/lib/payouts";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const appRole = session.user.appRole;
  if (appRole !== "admin" && appRole !== "manager") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const runIds = (req.nextUrl.searchParams.get("runIds") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  if (runIds.length === 0) {
    return NextResponse.json({ candidates: [] });
  }

  const supabase = createServerSupabaseClient();

  try {
    const candidates = await getPayoutCandidatesForRuns(supabase, runIds);
    return NextResponse.json({ candidates });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error cargando candidatos de pago";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
