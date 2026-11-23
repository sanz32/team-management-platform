import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { markAllAdjustmentsPaid } from "@/lib/balance";

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
  const { category } = body as { category?: string };

  if (category !== "ib" && category !== "gold") {
    return NextResponse.json({ error: "Categoría (ib o gold) obligatoria" }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();

  try {
    const { amount, users } = await markAllAdjustmentsPaid(supabase, category);
    return NextResponse.json({ category, paidAmount: amount, usersAffected: users });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error marcando como pagado";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
