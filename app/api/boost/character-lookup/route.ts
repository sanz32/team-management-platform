import { NextRequest, NextResponse } from "next/server";
import { fetchCharacterData, fetchCharacterMedia } from "@/lib/blizzard";
import { isBoostRegion, isPlausibleCharacterName, realmSlug } from "@/lib/boost";
import { characterLookupLimiter, clientIpFromHeaders } from "@/lib/boost-rate-limit";

export async function POST(req: NextRequest) {
  try {
    const ip = clientIpFromHeaders(req.headers);
    if (ip && !characterLookupLimiter.check(ip)) {
      return NextResponse.json({ error: "too_many_requests" }, { status: 429 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      name?: unknown;
      realm?: unknown;
      region?: unknown;
    };

    const name = typeof body.name === "string" ? body.name.trim() : "";
    const realm = typeof body.realm === "string" ? body.realm.trim() : "";
    const region = typeof body.region === "string" ? body.region.trim().toLowerCase() : "";

    if (!name || !realm || !isBoostRegion(region)) {
      return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    }

    if (!isPlausibleCharacterName(name)) {
      return NextResponse.json({ found: false });
    }

    const slug = realmSlug(realm);
    if (!slug) {
      return NextResponse.json({ found: false });
    }

    const [character, media] = await Promise.all([
      fetchCharacterData(region, slug, name),
      fetchCharacterMedia(region, slug, name).catch(() => null),
    ]);

    if (!character.found) {
      return NextResponse.json({ found: false });
    }

    return NextResponse.json({
      found: true,
      character: {
        name: name.charAt(0).toUpperCase() + name.slice(1),
        realm: character.realmName ?? realm,
        realmSlug: slug,
        region,
        class: character.class,
        spec: character.activeSpec,
        ilvl: character.ilvl,
        faction: character.faction,
        avatarUrl: media?.avatarUrl ?? null,
      },
    });
  } catch (err) {
    console.error("Error buscando el personaje del comprador:", err);
    return NextResponse.json({ error: "lookup_failed" }, { status: 502 });
  }
}
