import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { refreshArmorySnapshot } from "@/lib/character-armory";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { id } = await params;
  const discordId = session.user.discordId;
  const appRole = session.user.appRole;
  const canManageAny = appRole === "admin" || appRole === "manager";

  const supabase = createServerSupabaseClient();

  const { data: appUser } = await supabase
    .from("app_users")
    .select("id")
    .eq("discord_id", discordId)
    .maybeSingle();

  if (!appUser) {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  }

  const { data: character, error } = await supabase
    .from("characters")
    .select("id, user_id, region, realm_slug, name, mythic_plus_rating")
    .eq("id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!character) {
    return NextResponse.json({ error: "Personaje no encontrado" }, { status: 404 });
  }

  const isOwner = character.user_id === appUser.id;
  if (!isOwner && !canManageAny) {
    return NextResponse.json(
      { error: "No tienes permiso para actualizar este personaje" },
      { status: 403 }
    );
  }

  try {
    const snapshot = await refreshArmorySnapshot(supabase, character);
    return NextResponse.json(snapshot);
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo consultar el Armory ahora mismo.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
