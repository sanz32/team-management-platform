import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  checkFormTiming,
  isBoostRegion,
  isHoneypotTripped,
  isPlausibleCharacterName,
  isSlotBookable,
  getBoostRedirectUri,
  realmSlug,
} from "@/lib/boost";
import {
  BOOST_DRAFT_COOKIE,
  BOOST_DRAFT_MAX_AGE_SECONDS,
  encodeDraft,
  randomToken,
  readFormToken,
} from "@/lib/boost-draft";
import { dealDayKey } from "@/lib/boost-deals";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    if (isHoneypotTripped(body.website)) {
      return NextResponse.json({ ok: true, url: null });
    }

    const issuedAt = readFormToken(typeof body.formToken === "string" ? body.formToken : null);
    if (issuedAt === null) {
      return NextResponse.json({ error: "invalid_form" }, { status: 400 });
    }
    const timing = checkFormTiming(issuedAt);
    if (timing === "too_fast") {
      return NextResponse.json({ error: "too_fast" }, { status: 429 });
    }
    if (timing === "expired") {
      return NextResponse.json({ error: "form_expired" }, { status: 400 });
    }

    const offerId = typeof body.offerId === "string" ? body.offerId : "";
    const slotId = typeof body.slotId === "string" ? body.slotId : "";
    const characterName = typeof body.characterName === "string" ? body.characterName.trim() : "";
    const characterRealm = typeof body.characterRealm === "string" ? body.characterRealm.trim() : "";
    const characterRegion =
      typeof body.characterRegion === "string" ? body.characterRegion.trim().toLowerCase() : "";

    if (
      !offerId ||
      !isPlausibleCharacterName(characterName) ||
      !characterRealm ||
      !isBoostRegion(characterRegion)
    ) {
      return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();

    const { data: offer } = await supabase
      .from("boost_offers")
      .select("id, is_active")
      .eq("id", offerId)
      .maybeSingle();

    if (!offer || !offer.is_active) {
      return NextResponse.json({ error: "offer_unavailable" }, { status: 409 });
    }

    if (slotId) {
      const { data: slot } = await supabase
        .from("boost_schedule_slots")
        .select("id, scheduled_at, capacity, booked_count, local_hold_count, is_active")
        .eq("id", slotId)
        .maybeSingle();

      if (
        !slot ||
        !isSlotBookable({
          scheduledAt: slot.scheduled_at,
          capacity: slot.capacity,
          bookedCount: slot.booked_count,
          localHoldCount: slot.local_hold_count,
          isActive: slot.is_active,
        })
      ) {
        return NextResponse.json({ error: "slot_unavailable" }, { status: 409 });
      }

      const { data: link } = await supabase
        .from("boost_slot_offers")
        .select("slot_id")
        .eq("slot_id", slotId)
        .eq("offer_id", offerId)
        .maybeSingle();

      if (!link) {
        return NextResponse.json({ error: "offer_not_in_slot" }, { status: 409 });
      }
    }

    const state = randomToken(16);
    const draftToken = encodeDraft({
      state,
      offerId,
      slotId: slotId || null,
      raiderSlug: typeof body.ref === "string" && body.ref.trim() ? body.ref.trim().slice(0, 24) : null,
      characterName: characterName.charAt(0).toUpperCase() + characterName.slice(1),
      characterRealm,
      characterRealmSlug: realmSlug(characterRealm),
      characterRegion,
      characterClass: typeof body.characterClass === "string" ? body.characterClass : null,
      characterSpec: typeof body.characterSpec === "string" ? body.characterSpec : null,
      characterIlvl: typeof body.characterIlvl === "number" ? body.characterIlvl : null,
      note: typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 500) : null,
      dealDayKey: dealDayKey(),
      issuedAt: Date.now(),
    });

    const authorizeUrl = new URL("https://discord.com/api/oauth2/authorize");
    authorizeUrl.searchParams.set("client_id", process.env.DISCORD_CLIENT_ID!);
    authorizeUrl.searchParams.set("redirect_uri", getBoostRedirectUri());
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("scope", "identify");
    authorizeUrl.searchParams.set("state", state);
    authorizeUrl.searchParams.set("prompt", "consent");

    const res = NextResponse.json({ ok: true, url: authorizeUrl.toString() });
    res.cookies.set(BOOST_DRAFT_COOKIE, draftToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: BOOST_DRAFT_MAX_AGE_SECONDS,
      path: "/",
    });
    return res;
  } catch (err) {
    console.error("Error arrancando el OAuth del comprador:", err);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
