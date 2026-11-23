import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { hashToken } from "@/lib/desktop-sync";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.discordId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { deviceCode } = body as { deviceCode?: string };
  if (!deviceCode) {
    return NextResponse.json({ error: "Falta deviceCode" }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();

  const { data: appUser } = await supabase
    .from("app_users")
    .select("id")
    .eq("discord_id", session.user.discordId)
    .maybeSingle();

  if (!appUser) {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  }

  const { data: pairing, error: pairingError } = await supabase
    .from("sync_device_pairings")
    .select("id, status, expires_at")
    .eq("device_code", deviceCode)
    .maybeSingle();

  if (pairingError) {
    return NextResponse.json({ error: pairingError.message }, { status: 500 });
  }
  if (!pairing) {
    return NextResponse.json({ error: "Código de emparejamiento inválido" }, { status: 404 });
  }
  if (pairing.status !== "pending") {
    return NextResponse.json({ error: "Este código ya fue usado" }, { status: 410 });
  }
  if (new Date(pairing.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: "Este código venció, genera uno nuevo desde la app" }, { status: 410 });
  }

  const rawToken = crypto.randomBytes(32).toString("hex");

  const { error: tokenError } = await supabase
    .from("sync_tokens")
    .upsert(
      { user_id: appUser.id, token_hash: hashToken(rawToken), created_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );
  if (tokenError) {
    return NextResponse.json({ error: `Error generando el token: ${tokenError.message}` }, { status: 500 });
  }

  const { error: updateError } = await supabase
    .from("sync_device_pairings")
    .update({ status: "approved", user_id: appUser.id, token_to_deliver: rawToken })
    .eq("id", pairing.id);
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
