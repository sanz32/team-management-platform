import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getCurrentAppUserId } from "@/lib/current-app-user";
import { markPayoutItemPaid } from "@/lib/payouts";

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
    const item = await markPayoutItemPaid(supabase, id, { txReference: txReference?.trim() || null, paidBy });
    return NextResponse.json({ item });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error confirmando el pago";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
