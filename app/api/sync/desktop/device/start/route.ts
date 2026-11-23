import { NextResponse } from "next/server";
import crypto from "crypto";
import { createServerSupabaseClient } from "@/lib/supabase-server";

const PAIRING_TTL_SECONDS = 600;
const POLL_INTERVAL_MS = 3000;

export async function POST() {
  const deviceCode = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + PAIRING_TTL_SECONDS * 1000).toISOString();

  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("sync_device_pairings").insert({
    device_code: deviceCode,
    status: "pending",
    expires_at: expiresAt,
  });

  if (error) {
    return NextResponse.json(
      { error: `Error creando el emparejamiento: ${error.message}` },
      { status: 500 }
    );
  }

  const portalUrl = (process.env.NEXTAUTH_URL || "").replace(/\/+$/, "");

  return NextResponse.json({
    deviceCode,
    verificationUrl: `${portalUrl}/conectar-app?code=${deviceCode}`,
    pollIntervalMs: POLL_INTERVAL_MS,
    expiresInSeconds: PAIRING_TTL_SECONDS,
  });
}
