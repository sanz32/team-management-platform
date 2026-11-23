import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  BlizzardReauthRequiredError,
  MIN_LEVEL_TO_IMPORT,
  fetchAccountCharacters,
  getUserBlizzardConnection,
} from "@/lib/blizzard-oauth";

export async function GET() {
  const session = await auth();
  const discordId = session?.user?.discordId;
  if (!discordId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
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

  try {
    const connection = await getUserBlizzardConnection(supabase, appUser.id);
    if (!connection) {
      return NextResponse.json({ connected: false, candidates: [] });
    }

    const accountCharacters = await fetchAccountCharacters(connection.token);

    const { data: existing, error: existingError } = await supabase
      .from("characters")
      .select("id, name, realm_slug, region, wow_account_number")
      .eq("user_id", appUser.id);

    if (existingError) {
      console.error("Error consultando characters existentes:", JSON.stringify(existingError, null, 2));
      return NextResponse.json({ error: "No se pudo verificar tus personajes ya cargados" }, { status: 500 });
    }

    const accountKey = (name: string, realmSlug: string, region: string) =>
      `${name.toLowerCase()}-${realmSlug.toLowerCase()}-${region.toLowerCase()}`;

    const existingKeys = new Set(
      (existing ?? []).map((c) => accountKey(c.name, c.realm_slug, c.region))
    );

    const byKey = new Map(
      accountCharacters
        .filter((c) => c.wowAccountNumber != null)
        .map((c) => [accountKey(c.name, c.realmSlug, c.region), c.wowAccountNumber] as const)
    );
    const toBackfill = (existing ?? []).filter((c) => {
      const wowAccountNumber = byKey.get(accountKey(c.name, c.realm_slug, c.region));
      return wowAccountNumber != null && wowAccountNumber !== c.wow_account_number;
    });
    if (toBackfill.length > 0) {
      const results = await Promise.all(
        toBackfill.map((c) =>
          supabase
            .from("characters")
            .update({ wow_account_number: byKey.get(accountKey(c.name, c.realm_slug, c.region)) })
            .eq("id", c.id)
        )
      );
      const failed = results.find((r) => r.error);
      if (failed?.error) {
        console.error("Error backfilleando wow_account_number:", JSON.stringify(failed.error, null, 2));
      }
    }

    const candidates = accountCharacters
      .filter((c) => c.level >= MIN_LEVEL_TO_IMPORT)
      .map((c) => ({
        ...c,
        alreadyAdded: existingKeys.has(accountKey(c.name, c.realmSlug, c.region)),
      }));

    return NextResponse.json({
      connected: true,
      candidates,
      battletag: connection.battletag,
      minLevel: MIN_LEVEL_TO_IMPORT,
    });
  } catch (err) {
    if (err instanceof BlizzardReauthRequiredError) {
      return NextResponse.json({ connected: false, candidates: [], error: err.message });
    }
    const message = err instanceof Error ? err.message : "Error inesperado consultando Blizzard";
    console.error("Error en GET /api/blizzard/characters:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
