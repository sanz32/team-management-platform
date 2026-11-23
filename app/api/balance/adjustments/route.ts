import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";

interface AdjustmentRow {
  id: string;
  amount: number;
  note: string | null;
  created_at: string;
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const appRole = session.user.appRole;
  if (appRole !== "admin" && appRole !== "manager" && appRole !== "guest") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: "Falta userId" }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("balance_adjustments")
    .select("id, type, amount, note, created_at")
    .eq("user_id", userId)
    .eq("paid", false)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ib: AdjustmentRow[] = [];
  const gold: AdjustmentRow[] = [];
  for (const row of data ?? []) {
    const entry: AdjustmentRow = {
      id: row.id,
      amount: Number(row.amount),
      note: row.note,
      created_at: row.created_at,
    };
    (row.type === "gold" ? gold : ib).push(entry);
  }

  return NextResponse.json({ ib, gold });
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

  const discordId = session.user.discordId;
  const body = await req.json().catch(() => ({}));
  const { user_id, type, amount, note } = body as {
    user_id?: string;
    type?: string;
    amount?: number;
    note?: string;
  };

  if (!user_id || (type !== "ib" && type !== "gold") || !Number.isFinite(amount) || amount === 0) {
    return NextResponse.json(
      { error: "Usuario, tipo (IB o Gold) y un monto válido son obligatorios" },
      { status: 400 }
    );
  }

  const supabase = createServerSupabaseClient();

  const { data: appUser } = await supabase
    .from("app_users")
    .select("id")
    .eq("discord_id", discordId)
    .single();

  if (!appUser) {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("balance_adjustments")
    .insert({ user_id, type, amount, note: note || null, created_by: appUser.id })
    .select("id, type, amount, note, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ adjustment: data });
}
