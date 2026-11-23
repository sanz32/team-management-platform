import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { sendDirectMessage } from "@/lib/discord-bot";
import {
  BOOKING_WINDOW_MINUTES,
  formatGold,
  getBoostRedirectUri,
  isRateLimited,
} from "@/lib/boost";
import { BOOST_DRAFT_COOKIE, decodeDraft, hashIp, randomToken } from "@/lib/boost-draft";
import { DEAL_DISCOUNT_PCT, applyDeal } from "@/lib/boost-deals";
import { getDealIdsForDay } from "@/lib/boost-store";
import { getFallbackRaider } from "@/lib/boost-links";
import { clientIpFromHeaders } from "@/lib/boost-rate-limit";

function errorRedirect(req: NextRequest, code: string): NextResponse {
  const res = NextResponse.redirect(new URL(`/boost?error=${code}`, req.nextUrl.origin));
  res.cookies.delete(BOOST_DRAFT_COOKIE);
  return res;
}

export async function GET(req: NextRequest) {
  try {
    const code = req.nextUrl.searchParams.get("code");
    const state = req.nextUrl.searchParams.get("state");
    const draft = decodeDraft(req.cookies.get(BOOST_DRAFT_COOKIE)?.value);

    if (req.nextUrl.searchParams.get("error")) {
      return errorRedirect(req, "cancelado");
    }

    if (!draft) {
      return errorRedirect(req, "expirado");
    }

    if (!code || !state || state !== draft.state) {
      return errorRedirect(req, "estado_invalido");
    }

    const clientId = process.env.DISCORD_CLIENT_ID;
    const clientSecret = process.env.DISCORD_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      console.error("Falta DISCORD_CLIENT_ID/SECRET para el OAuth del comprador");
      return errorRedirect(req, "config");
    }

    const tokenRes = await fetch("https://discord.com/api/v10/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "authorization_code",
        code,
        redirect_uri: getBoostRedirectUri(),
      }).toString(),
    });

    if (!tokenRes.ok) {
      console.error("Error intercambiando el code de Discord:", await tokenRes.text());
      return errorRedirect(req, "discord");
    }

    const tokenData = (await tokenRes.json()) as { access_token?: string };
    if (!tokenData.access_token) return errorRedirect(req, "discord");

    const meRes = await fetch("https://discord.com/api/v10/users/@me", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!meRes.ok) {
      console.error("Error leyendo la identidad del comprador:", await meRes.text());
      return errorRedirect(req, "discord");
    }

    const me = (await meRes.json()) as {
      id: string;
      username?: string;
      global_name?: string | null;
      discriminator?: string;
      avatar?: string | null;
    };

    if (!me.id) return errorRedirect(req, "discord");

    const supabase = createServerSupabaseClient();

    const windowStart = new Date(Date.now() - BOOKING_WINDOW_MINUTES * 60_000).toISOString();
    const { count: recentCount } = await supabase
      .from("boost_bookings")
      .select("id", { count: "exact", head: true })
      .eq("buyer_discord_id", me.id)
      .gte("created_at", windowStart);

    if (isRateLimited(recentCount ?? 0)) {
      return errorRedirect(req, "demasiadas_reservas");
    }

    const [offerRes, slotRes, linkRes] = await Promise.all([
      supabase
        .from("boost_offers")
        .select("id, title_en, price_gold, category, is_active")
        .eq("id", draft.offerId)
        .maybeSingle(),
      draft.slotId
        ? supabase
            .from("boost_schedule_slots")
            .select("id, scheduled_at, label, difficulty")
            .eq("id", draft.slotId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      draft.raiderSlug
        ? supabase
            .from("boost_raider_links")
            .select("app_user_id, app_users(discord_id, nickname, discord_username)")
            .eq("slug", draft.raiderSlug)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const offer = offerRes.data as {
      id: string;
      title_en: string;
      price_gold: number;
      category: string;
      is_active: boolean;
    } | null;
    const slot = slotRes.data as {
      id: string;
      scheduled_at: string;
      label: string | null;
      difficulty: string;
    } | null;

    if (!offer || !offer.is_active) return errorRedirect(req, "no_disponible");
    if (draft.slotId && !slot) return errorRedirect(req, "no_disponible");

    if (draft.slotId) {
      const { data: claimed, error: claimError } = await supabase.rpc("boost_claim_slot", {
        p_slot_id: draft.slotId,
      });

      if (claimError) {
        console.error("Error reservando el cupo:", claimError);
        return errorRedirect(req, "cupo");
      }
      if (claimed !== true) {
        return errorRedirect(req, "cupo_lleno");
      }
    }

    const linkRow = linkRes.data as {
      app_user_id: string;
      app_users?: { discord_id: string | null; nickname: string | null; discord_username: string | null } | null;
    } | null;

    const fallback = linkRow ? null : await getFallbackRaider(supabase);
    const ownerId = linkRow?.app_user_id ?? fallback?.appUserId ?? null;
    const ownerDiscordId = linkRow?.app_users?.discord_id ?? fallback?.discordId ?? null;

    const statusToken = randomToken(24);
    const buyerName = me.global_name || me.username || null;
    const avatarUrl = me.avatar
      ? `https://cdn.discordapp.com/avatars/${me.id}/${me.avatar}.png?size=128`
      : null;

    let enOfertaHoy = false;
    if (draft.dealDayKey) {
      try {
        const deals = await getDealIdsForDay(draft.dealDayKey);
        enOfertaHoy = deals.has(offer.id);
      } catch (err) {
        console.error("No se pudo resolver la oferta del día del lead:", err);
      }
    }
    const precios = applyDeal(Number(offer.price_gold), enOfertaHoy);

    const snapshot = {
      title: offer.title_en,
      price: precios.priceGold as number | null,
      listPrice: precios.listPriceGold,
      category: offer.category,
    };

    const { error: insertError } = await supabase.from("boost_bookings").insert({
      offer_id: offer.id,
      schedule_slot_id: slot?.id ?? null,
      source: slot ? "run" : "package",
      raider_owner_id: ownerId,
      offer_title: snapshot.title,
      offer_price_gold: snapshot.price,
      offer_list_price_gold: snapshot.listPrice,
      offer_category: snapshot.category,
      slot_scheduled_at: slot?.scheduled_at ?? null,
      character_name: draft.characterName,
      character_realm: draft.characterRealm,
      character_realm_slug: draft.characterRealmSlug,
      character_region: draft.characterRegion,
      character_class: draft.characterClass,
      character_spec: draft.characterSpec,
      character_ilvl: draft.characterIlvl,
      buyer_discord_id: me.id,
      buyer_discord_username: buyerName,
      buyer_discord_avatar_url: avatarUrl,
      buyer_note: draft.note,
      status: "pending",
      status_token: statusToken,
      ip_hash: hashIp(clientIpFromHeaders(req.headers)),
    });

    if (insertError) {
      console.error("Error guardando el lead:", insertError);
      if (draft.slotId) await supabase.rpc("boost_release_slot", { p_slot_id: draft.slotId });
      return errorRedirect(req, "guardado");
    }

    if (ownerDiscordId) {
      const when = slot
        ? new Date(slot.scheduled_at).toLocaleString("es-CL", {
            dateStyle: "medium",
            timeStyle: "short",
          })
        : null;
      await sendDirectMessage(
        ownerDiscordId,
        linkRow
          ? "Te llegó una reserva nueva por tu link."
          : "Entró una reserva SIN link personalizado, así que te queda a ti.",
        {
          title: snapshot.title,
          description: [
            `**Comprador:** ${buyerName ?? "sin nombre"} (<@${me.id}>)`,
            `**Personaje:** ${draft.characterName}-${draft.characterRealm} (${draft.characterRegion.toUpperCase()})`,
            draft.characterClass ? `**Clase:** ${draft.characterClass}${draft.characterSpec ? ` · ${draft.characterSpec}` : ""}` : null,
            draft.characterIlvl ? `**ilvl:** ${draft.characterIlvl}` : null,
            when ? `**Horario:** ${when}${slot?.label ? ` · ${slot.label}` : ""}` : "**Horario:** a acordar",
            snapshot.price != null
              ? `**Precio:** ${formatGold(Number(snapshot.price), "es")} de oro${
                  snapshot.listPrice != null
                    ? ` · oferta del día −${DEAL_DISCOUNT_PCT}% (lista: ${formatGold(
                        Number(snapshot.listPrice),
                        "es"
                      )})`
                    : ""
                }`
              : null,
            draft.note ? `**Nota:** ${draft.note}` : null,
            "",
            "Escríbele para cerrar la reserva.",
          ]
            .filter(Boolean)
            .join("\n"),
          color: 0xff7d0a,
        }
      );
    }

    const res = NextResponse.redirect(
      new URL(`/boost/estado/${statusToken}?nuevo=1`, req.nextUrl.origin)
    );
    res.cookies.delete(BOOST_DRAFT_COOKIE);
    return res;
  } catch (err) {
    console.error("Error cerrando la reserva del comprador:", err);
    return errorRedirect(req, "server");
  }
}
