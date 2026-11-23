import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { unmarkPayoutItemPaid } from "@/lib/payouts";

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
  const supabase = createServerSupabaseClient();

  try {
    const item = await unmarkPayoutItemPaid(supabase, id);
    return NextResponse.json({ item });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error deshaciendo el pago";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
