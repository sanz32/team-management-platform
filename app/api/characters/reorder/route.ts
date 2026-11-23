import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export async function PATCH(req: NextRequest) {
  const session = await auth();
  const discordId = session?.user?.discordId;
  if (!discordId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { characterIds } = body as { characterIds?: string[] };

  if (!Array.isArray(characterIds) || characterIds.length === 0) {
    return NextResponse.json({ error: "characterIds es obligatorio" }, { status: 400 });
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

  const { data: owned, error: ownedError } = await supabase
    .from("characters")
    .select("id")
    .eq("user_id", appUser.id);

  if (ownedError) {
    return NextResponse.json({ error: ownedError.message }, { status: 500 });
  }

  const ownedIds = new Set((owned ?? []).map((c) => c.id));
  const allOwnedByUser = characterIds.every((id) => ownedIds.has(id));
  if (!allOwnedByUser) {
    return NextResponse.json({ error: "Solo puedes reordenar tus propios personajes" }, { status: 403 });
  }

  const results = await Promise.all(
    characterIds.map((id, index) =>
      supabase.from("characters").update({ sort_order: index }).eq("id", id)
    )
  );

  const failed = results.find((r) => r.error);
  if (failed?.error) {
    return NextResponse.json({ error: failed.error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
