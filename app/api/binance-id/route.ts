import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getCurrentAppUserId } from "@/lib/current-app-user";
import { validateBinanceId } from "@/lib/binance-id";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const validation = validateBinanceId(body.binanceId as string | null | undefined);
  if ("error" in validation) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }
  const binanceId = validation.value;

  const supabase = createServerSupabaseClient();
  const appUserId = await getCurrentAppUserId(supabase, session.user);
  if (!appUserId) {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("app_users")
    .update({ binance_id: binanceId })
    .eq("id", appUserId)
    .select("binance_id")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ binanceId: data?.binance_id ?? null });
}
