import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";

const GOLD_UNIT = 1_000_000;

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const supabase = createServerSupabaseClient();
  const { data } = await supabase
    .from("gold_exchange_rate")
    .select("gold_per_usd, updated_at")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const goldPerUsd = data ? Number(data.gold_per_usd) : null;

  return NextResponse.json({
    goldPerUsd,
    usdPerMillion: goldPerUsd ? GOLD_UNIT / goldPerUsd : null,
    updatedAt: data?.updated_at ?? null,
  });
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
  const usdPerMillion = Number((body as { usdPerMillion?: number }).usdPerMillion);

  if (!Number.isFinite(usdPerMillion) || usdPerMillion <= 0) {
    return NextResponse.json({ error: "Precio inválido" }, { status: 400 });
  }

  const goldPerUsd = GOLD_UNIT / usdPerMillion;

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
    .from("gold_exchange_rate")
    .insert({ gold_per_usd: goldPerUsd, updated_by: appUser.id })
    .select("gold_per_usd, updated_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    goldPerUsd: Number(data.gold_per_usd),
    usdPerMillion,
    updatedAt: data.updated_at,
  });
}
