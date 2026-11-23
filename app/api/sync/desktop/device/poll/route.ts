import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { deviceCode } = body as { deviceCode?: string };
  if (!deviceCode) {
    return NextResponse.json({ error: "Falta deviceCode" }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();

  const { data: pairing, error } = await supabase
    .from("sync_device_pairings")
    .select("id, status, expires_at, token_to_deliver")
    .eq("device_code", deviceCode)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!pairing || new Date(pairing.expires_at).getTime() < Date.now()) {
    if (pairing) {
      await supabase.from("sync_device_pairings").delete().eq("id", pairing.id);
    }
    return NextResponse.json({ status: "expired" });
  }

  if (pairing.status === "pending") {
    return NextResponse.json({ status: "pending" });
  }

  await supabase.from("sync_device_pairings").delete().eq("id", pairing.id);
  return NextResponse.json({ status: "approved", token: pairing.token_to_deliver });
}
