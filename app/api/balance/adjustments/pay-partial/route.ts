import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { payPartialAdjustment, payPartialAdjustmentForAllUsers } from "@/lib/balance";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const appRole = session.user.appRole;
  if (appRole !== "admin" && appRole !== "manager") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const discordId = session.user.discordId;
  const body = await req.json().catch(() => ({}));
  const { user_id, type, amount, all } = body as {
    user_id?: string;
    type?: string;
    amount?: number;
    all?: boolean;
  };

  if ((type !== "ib" && type !== "gold") || !Number.isFinite(amount)) {
    return NextResponse.json({ error: "Tipo (IB o Gold) y un monto válido son obligatorios" }, { status: 400 });
  }
  if (!all && !user_id) {
    return NextResponse.json({ error: "Falta el usuario (o marcar el pago para todos)" }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();

  const { data: appUser } = await supabase
    .from("app_users")
    .select("id")
    .eq("discord_id", discordId)
    .single();

  try {
    const result = all
      ? await payPartialAdjustmentForAllUsers(supabase, type, amount as number, appUser?.id ?? null)
      : await payPartialAdjustment(supabase, user_id as string, type, amount as number, appUser?.id ?? null);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error registrando el pago parcial";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
