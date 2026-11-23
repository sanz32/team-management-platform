import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getWclRedirectUri } from "@/lib/wcl";

export async function GET(req: NextRequest) {
  const session = await auth();
  const appRole = session?.user?.appRole;
  const discordId = session?.user?.discordId;

  if (appRole !== "admin") {
    return NextResponse.redirect(new URL("/cuentas?wcl_error=no_autorizado", req.url));
  }

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const savedState = req.cookies.get("wcl_oauth_state")?.value;

  if (!code || !state || !savedState || state !== savedState) {
    return NextResponse.redirect(new URL("/cuentas?wcl_error=estado_invalido", req.url));
  }

  const clientId = process.env.WCL_CLIENT_ID!;
  const clientSecret = process.env.WCL_CLIENT_SECRET!;

  const tokenRes = await fetch("https://www.warcraftlogs.com/oauth/token", {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: getWclRedirectUri(),
    }).toString(),
  });

  if (!tokenRes.ok) {
    const clearRes = NextResponse.redirect(new URL("/cuentas?wcl_error=intercambio_token", req.url));
    clearRes.cookies.delete("wcl_oauth_state");
    return clearRes;
  }

  const tokenData = await tokenRes.json();

  let wclUserName: string | null = null;
  try {
    const meRes = await fetch("https://www.warcraftlogs.com/api/v2/user", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: "query { userData { currentUser { name } } }" }),
    });
    const meJson = await meRes.json();
    wclUserName = meJson?.data?.userData?.currentUser?.name ?? null;
  } catch {
    wclUserName = null;
  }

  const supabase = createServerSupabaseClient();
  const { data: appUser } = await supabase
    .from("app_users")
    .select("id")
    .eq("discord_id", discordId)
    .single();

  const { error } = await supabase.from("wcl_oauth_tokens").insert({
    connected_by: appUser?.id ?? null,
    wcl_user_name: wclUserName,
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    expires_at: new Date(Date.now() + (tokenData.expires_in - 300) * 1000).toISOString(),
  });

  const redirectUrl = error
    ? new URL("/cuentas?wcl_error=guardado", req.url)
    : new URL("/cuentas?wcl_connected=1", req.url);

  const res = NextResponse.redirect(redirectUrl);
  res.cookies.delete("wcl_oauth_state");
  return res;
}
