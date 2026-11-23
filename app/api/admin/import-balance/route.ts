import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";

interface ImportRow {
  player_name: string;
  balance_gold: number;
  balance_usd: number;
}

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const appRole = session.user.appRole;
  if (appRole !== "admin" && appRole !== "manager") {
    return NextResponse.json({ error: "No autorizado para importar balances" }, { status: 403 });
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.from("app_users").select("id, discord_username");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ members: data ?? [] });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const appRole = session.user.appRole;
  if (appRole !== "admin" && appRole !== "manager") {
    return NextResponse.json({ error: "No autorizado para importar balances" }, { status: 403 });
  }

  const discordId = session.user.discordId;
  const body = await req.json().catch(() => ({}));
  const rows = (body as { rows?: ImportRow[] }).rows;

  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: "No hay filas para importar" }, { status: 400 });
  }

  const cleanedRows = rows
    .filter((r) => typeof r.player_name === "string" && r.player_name.trim().length > 0)
    .map((r) => ({
      player_name: r.player_name.trim(),
      balance_gold: Number(r.balance_gold) || 0,
      balance_usd: Number(r.balance_usd) || 0,
    }));

  if (cleanedRows.length === 0) {
    return NextResponse.json({ error: "No hay filas válidas para importar" }, { status: 400 });
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

  const { data: members } = await supabase.from("app_users").select("id, discord_username");
  const byUsername = new Map(
    (members ?? []).map((m) => [String(m.discord_username ?? "").toLowerCase(), m.id as string])
  );

  const toUpsert = cleanedRows.map((r) => ({
    player_name: r.player_name,
    balance_gold: r.balance_gold,
    balance_usd: r.balance_usd,
    matched_user_id: byUsername.get(r.player_name.toLowerCase()) ?? null,
    imported_at: new Date().toISOString(),
  }));

  const { data: saved, error: upsertError } = await supabase
    .from("external_balances")
    .upsert(toUpsert, { onConflict: "player_name" })
    .select("id, balance_gold, balance_usd, matched_user_id");

  if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 500 });

  const savedRows = saved ?? [];
  const externalBalanceIds = savedRows.map((r) => r.id);

  if (externalBalanceIds.length > 0) {
    const { error: deleteError } = await supabase
      .from("balance_adjustments")
      .delete()
      .in("external_balance_id", externalBalanceIds)
      .eq("paid", false);

    if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  const newAdjustments = savedRows.flatMap((r) => {
    if (!r.matched_user_id) return [];
    const rowsToInsert: {
      user_id: string;
      type: "gold" | "ib";
      amount: number;
      created_by: string;
      external_balance_id: string;
    }[] = [];
    if (Number(r.balance_gold) !== 0) {
      rowsToInsert.push({
        user_id: r.matched_user_id,
        type: "gold",
        amount: Number(r.balance_gold),
        created_by: appUser.id,
        external_balance_id: r.id,
      });
    }
    if (Number(r.balance_usd) !== 0) {
      rowsToInsert.push({
        user_id: r.matched_user_id,
        type: "ib",
        amount: Number(r.balance_usd),
        created_by: appUser.id,
        external_balance_id: r.id,
      });
    }
    return rowsToInsert;
  });

  if (newAdjustments.length > 0) {
    const { error: insertError } = await supabase.from("balance_adjustments").insert(newAdjustments);
    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  const matched = savedRows.filter((r) => r.matched_user_id).length;

  return NextResponse.json({
    imported: savedRows.length,
    matched,
    unmatched: savedRows.length - matched,
  });
}
