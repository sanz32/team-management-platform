import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getBlizzardOAuthRedirectUri } from "@/lib/blizzard-oauth";

export async function GET(req: NextRequest) {
  const session = await auth();
  const discordId = session?.user?.discordId;

  if (!discordId) {
    return NextResponse.redirect(new URL("/characters?blizzard_error=no_autenticado", req.url));
  }

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const savedState = req.cookies.get("blizzard_oauth_state")?.value;

  if (!code || !state || !savedState || state !== savedState) {
    const res = NextResponse.redirect(new URL("/characters?blizzard_error=estado_invalido", req.url));
    res.cookies.delete("blizzard_oauth_state");
    return res;
  }

  const clientId = process.env.BLIZZARD_CLIENT_ID!;
  const clientSecret = process.env.BLIZZARD_CLIENT_SECRET!;

  const tokenRes = await fetch("https://oauth.battle.net/token", {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: getBlizzardOAuthRedirectUri(),
    }).toString(),
  });

  if (!tokenRes.ok) {
    const clearRes = NextResponse.redirect(new URL("/characters?blizzard_error=intercambio_token", req.url));
    clearRes.cookies.delete("blizzard_oauth_state");
    return clearRes;
  }

  const tokenData = await tokenRes.json();

  let battletag: string | null = null;
  try {
    const meRes = await fetch("https://oauth.battle.net/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const meJson = await meRes.json();
    battletag = meJson?.battletag ?? null;
  } catch {
    battletag = null;
  }

  const supabase = createServerSupabaseClient();
  const { data: appUser, error: appUserError } = await supabase
    .from("app_users")
    .select("id")
    .eq("discord_id", discordId)
    .single();

  if (appUserError || !appUser) {
    console.error("Error buscando app_users para conexión Blizzard:", JSON.stringify(appUserError, null, 2));
    const res = NextResponse.redirect(new URL("/characters?blizzard_error=guardado", req.url));
    res.cookies.delete("blizzard_oauth_state");
    return res;
  }

  const { error } = await supabase.from("blizzard_oauth_tokens").upsert(
    {
      user_id: appUser.id,
      battletag,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token ?? null,
      expires_at: new Date(Date.now() + (tokenData.expires_in - 300) * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  if (error) {
    console.error("Error guardando blizzard_oauth_tokens:", JSON.stringify(error, null, 2));
  }

  const redirectUrl = error
    ? new URL("/characters?blizzard_error=guardado", req.url)
    : new URL("/characters?blizzard_connected=1", req.url);

  const res = NextResponse.redirect(redirectUrl);
  res.cookies.delete("blizzard_oauth_state");
  return res;
}
