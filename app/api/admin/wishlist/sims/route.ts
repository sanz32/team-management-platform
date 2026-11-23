import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getFriendUserIds } from "@/lib/friend-members";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  if (session.user.appRole !== "admin" && session.user.appRole !== "manager") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("character_sims")
    .select(
      "id, provider, metric_type, imported_at, " +
        "characters(id, name, class, realm_name, realm_slug, user_id, app_users(discord_username, nickname)), " +
        "wow_specializations(spec_name, icon_url)"
    )
    .order("imported_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  interface Row {
    id: string;
    provider: string;
    metric_type: string;
    imported_at: string;
    characters: {
      id: string;
      name: string;
      class: string | null;
      realm_name: string | null;
      realm_slug: string;
      user_id: string;
      app_users: { discord_username: string | null; nickname: string | null } | null;
    } | null;
    wow_specializations: { spec_name: string; icon_url: string | null } | null;
  }

  const friendUserIds = await getFriendUserIds(supabase);

  const sims = ((data ?? []) as unknown as Row[])
    .filter((s) => s.characters && !friendUserIds.has(s.characters.user_id))
    .map((s) => ({
      id: s.id,
      provider: s.provider,
      metricType: s.metric_type,
      importedAt: s.imported_at,
      characterId: s.characters!.id,
      characterName: s.characters!.name,
      characterClass: s.characters!.class,
      characterRealmName: s.characters!.realm_name,
      characterRealmSlug: s.characters!.realm_slug,
      specName: s.wow_specializations?.spec_name ?? null,
      specIconUrl: s.wow_specializations?.icon_url ?? null,
      userId: s.characters!.user_id,
      userName: s.characters!.app_users?.nickname ?? s.characters!.app_users?.discord_username ?? "Desconocido",
    }));

  return NextResponse.json({ sims });
}

export async function DELETE() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  if (session.user.appRole !== "admin" && session.user.appRole !== "manager") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("character_sims").delete().not("id", "is", null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
