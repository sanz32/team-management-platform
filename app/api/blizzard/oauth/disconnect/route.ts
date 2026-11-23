import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { disconnectUserBlizzard } from "@/lib/blizzard-oauth";

export async function POST() {
  const session = await auth();
  const discordId = session?.user?.discordId;
  if (!discordId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const supabase = createServerSupabaseClient();
  const { data: appUser } = await supabase.from("app_users").select("id").eq("discord_id", discordId).single();

  if (!appUser) {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  }

  await disconnectUserBlizzard(supabase, appUser.id);
  return NextResponse.json({ ok: true });
}
