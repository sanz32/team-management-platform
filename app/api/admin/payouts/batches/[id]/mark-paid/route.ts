import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getCurrentAppUserId } from "@/lib/current-app-user";
import { markPayoutBatchPaid } from "@/lib/payouts";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
  const { txReference } = body as { txReference?: string | null };

  const supabase = createServerSupabaseClient();
  const paidBy = await getCurrentAppUserId(supabase, session.user);

  try {
    const items = await markPayoutBatchPaid(supabase, id, { txReference: txReference?.trim() || null, paidBy });
    return NextResponse.json({ items });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error confirmando el lote de pago";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
