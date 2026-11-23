import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
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

  const { data: characters, error } = await supabase
    .from("characters")
    .select("id, name, class, role, active_spec, ilvl, realm_name, realm_slug")
    .eq("user_id", appUser.id)
    .order("name");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const characterIds = (characters ?? []).map((c) => c.id);
  const { data: simRows } = characterIds.length
    ? await supabase.from("character_sims").select("character_id").in("character_id", characterIds)
    : { data: [] as { character_id: string }[] };
  const idsWithSims = new Set((simRows ?? []).map((s) => s.character_id));

  return NextResponse.json({
    characters: (characters ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      class: c.class,
      role: c.role,
      activeSpec: c.active_spec,
      ilvl: c.ilvl,
      realmName: c.realm_name,
      realmSlug: c.realm_slug,
      hasSims: idsWithSims.has(c.id),
    })),
  });
}
