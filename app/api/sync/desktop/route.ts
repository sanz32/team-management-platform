import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  resolveUserIdFromToken,
  matchSyncCharacters,
  matchGuildCharacters,
  filterFreshForeignCharacters,
  dedupeMatchedPreferOwn,
  upsertVaultAndCurrencies,
  updateCharacterScalarFields,
  pruneCurrenciesOutsideSeason,
  autoTrackSeasonCurrencies,
  SyncCharacterPayload,
} from "@/lib/desktop-sync";

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  const authHeader = req.headers.get("authorization") || "";
  const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!bearerToken) {
    return NextResponse.json({ error: "Falta Authorization: Bearer <token>" }, { status: 401 });
  }

  const supabase = createServerSupabaseClient();

  let userId: string | null;
  try {
    userId = await resolveUserIdFromToken(supabase, bearerToken);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error validando el token";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  if (!userId) {
    return NextResponse.json({ error: "Token inválido o revocado" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { characters, season } = body as {
    characters?: SyncCharacterPayload[];
    season?: { id?: unknown; currencyIds?: unknown };
  };

  if (!Array.isArray(characters) || characters.length === 0) {
    return NextResponse.json({ error: "Falta characters (array)" }, { status: 400 });
  }

  const validSeason =
    typeof season?.id === "number" &&
    Array.isArray(season.currencyIds) &&
    season.currencyIds.length > 0 &&
    season.currencyIds.every((id): id is number => typeof id === "number")
      ? { id: season.id, currencyIds: season.currencyIds as number[] }
      : null;

  try {
    const ownPayloads = characters.filter((c) => c.source !== "gg-relay");
    const relayPayloads = characters.filter((c) => c.source === "gg-relay");

    const { matched: ownMatched, unmatched } = await matchSyncCharacters(supabase, userId, ownPayloads);
    const { matched: relayMatchedRaw } = await matchGuildCharacters(supabase, relayPayloads);
    const relayMatched = filterFreshForeignCharacters(relayMatchedRaw);

    const matched = dedupeMatchedPreferOwn([...ownMatched, ...relayMatched]);

    await upsertVaultAndCurrencies(supabase, matched);

    const CHARACTER_CONCURRENCY = 5;
    for (let i = 0; i < matched.length; i += CHARACTER_CONCURRENCY) {
      const batch = matched.slice(i, i + CHARACTER_CONCURRENCY);
      await Promise.all(
        batch.map(({ character, characterId }) =>
          updateCharacterScalarFields(supabase, characterId, character)
        )
      );
    }

    if (validSeason && matched.length > 0) {
      await pruneCurrenciesOutsideSeason(
        supabase,
        matched.map(({ characterId }) => characterId),
        validSeason
      );
      await autoTrackSeasonCurrencies(supabase, validSeason);
    }

    return NextResponse.json({
      synced: matched.map(({ character, characterId }) => ({
        name: character.info.name,
        realm: character.info.realm,
        characterId,
      })),
      unmatched: unmatched.map((c) => ({ name: c.info.name, realm: c.info.realm })),
      guildRelaySynced: relayMatched.length,
    });
  } catch (err) {
    console.error(
      `[sync/desktop] fallo tras ${Date.now() - startedAt}ms para user ${userId}:`,
      err
    );
    const message = err instanceof Error ? err.message : "Error sincronizando personajes";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
