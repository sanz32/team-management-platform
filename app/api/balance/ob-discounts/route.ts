import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { applyObDiscount, applyObDiscountForAllUsers, getActiveObDiscountGroups } from "@/lib/balance";
import { getCurrentAppUserId } from "@/lib/current-app-user";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const appRole = session.user.appRole;
  if (appRole !== "admin" && appRole !== "manager") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const supabase = createServerSupabaseClient();
  const groups = await getActiveObDiscountGroups(supabase);
  return NextResponse.json({ groups });
}

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
  const { userId, amount, reason, all } = body as {
    userId?: string;
    amount?: number;
    reason?: string;
    all?: boolean;
  };

  if (!Number.isFinite(amount)) {
    return NextResponse.json({ error: "Un monto válido es obligatorio" }, { status: 400 });
  }
  if (!all && !userId) {
    return NextResponse.json({ error: "Falta el miembro (o marcar el descuento para todos)" }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const createdBy = await getCurrentAppUserId(supabase, session.user);

  try {
    const result = all
      ? await applyObDiscountForAllUsers(supabase, amount as number, reason?.trim() || null, createdBy)
      : await applyObDiscount(supabase, userId as string, amount as number, reason?.trim() || null, createdBy);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error aplicando el descuento";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
