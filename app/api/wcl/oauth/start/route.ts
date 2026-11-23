import { NextResponse } from "next/server";
import crypto from "crypto";
import { auth } from "@/lib/auth";
import { getWclRedirectUri } from "@/lib/wcl";

export async function GET() {
  const session = await auth();
  const appRole = session?.user?.appRole;

  if (appRole !== "admin") {
    return NextResponse.json(
      { error: "Solo un admin puede conectar la cuenta de Warcraft Logs" },
      { status: 403 }
    );
  }

  const state = crypto.randomBytes(16).toString("hex");
  const authorizeUrl = new URL("https://www.warcraftlogs.com/oauth/authorize");
  authorizeUrl.searchParams.set("client_id", process.env.WCL_CLIENT_ID!);
  authorizeUrl.searchParams.set("redirect_uri", getWclRedirectUri());
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("state", state);

  const res = NextResponse.redirect(authorizeUrl.toString());
  res.cookies.set("wcl_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return res;
}
