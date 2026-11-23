import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { revertObDiscountsByReason } from "@/lib/balance";
import { getCurrentAppUserId } from "@/lib/current-app-user";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const appRole = session.user.appRole;
  if (appRole !== "admin" && appRole !== "manager") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { reason } = body as { reason?: string | null };

  const supabase = createServerSupabaseClient();
  const revertedBy = await getCurrentAppUserId(supabase, session.user);

  try {
    const { amount, users } = await revertObDiscountsByReason(supabase, reason ?? null, revertedBy);
    return NextResponse.json({ revertedAmount: amount, usersAffected: users });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error reintegrando el descuento";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
