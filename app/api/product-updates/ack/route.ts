import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export async function POST(req: NextRequest) {
  const session = await auth();
  const discordId = session?.user?.discordId;
  if (!discordId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { updateId, dismiss, visit } = body as { updateId?: string; dismiss?: boolean; visit?: boolean };

  if (!updateId || (!dismiss && !visit)) {
    return NextResponse.json({ error: "updateId y al menos dismiss/visit son obligatorios" }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const patch: Record<string, string> = {};
  if (dismiss) patch.dismissed_update_id = updateId;
  if (visit) patch.visited_update_id = updateId;

  const { error } = await supabase.from("app_users").update(patch).eq("discord_id", discordId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
