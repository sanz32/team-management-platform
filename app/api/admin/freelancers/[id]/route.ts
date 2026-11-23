import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { updateFreelancerBinanceId } from "@/lib/freelancers";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const appRole = session.user.appRole;
  if (appRole !== "admin" && appRole !== "manager") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const { binanceId } = body as { binanceId?: string | null };

  const supabase = createServerSupabaseClient();

  try {
    const freelancer = await updateFreelancerBinanceId(supabase, id, binanceId ?? null);
    return NextResponse.json({ freelancer });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error guardando el Binance ID";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
