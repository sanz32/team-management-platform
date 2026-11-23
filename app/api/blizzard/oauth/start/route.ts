import { NextResponse } from "next/server";
import crypto from "crypto";
import { auth } from "@/lib/auth";
import { getBlizzardOAuthRedirectUri } from "@/lib/blizzard-oauth";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const state = crypto.randomBytes(16).toString("hex");
  const authorizeUrl = new URL("https://oauth.battle.net/authorize");
  authorizeUrl.searchParams.set("client_id", process.env.BLIZZARD_CLIENT_ID!);
  authorizeUrl.searchParams.set("redirect_uri", getBlizzardOAuthRedirectUri());
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("scope", "wow.profile");
  authorizeUrl.searchParams.set("state", state);

  const res = NextResponse.redirect(authorizeUrl.toString());
  res.cookies.set("blizzard_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return res;
}
