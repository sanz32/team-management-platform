import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { resolveWclLink, WclNotFoundError, WclRateLimitError, WclReauthRequiredError } from "@/lib/wcl";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const appRole = session.user.appRole;
  if (appRole !== "admin" && appRole !== "manager") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const supabase = createServerSupabaseClient();

  try {
    const body = await req.json().catch(() => ({}));
    const url = (body as { url?: string }).url;

    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "Falta el link del pull" }, { status: 400 });
    }

    const resolved = await resolveWclLink(supabase, url);
    return NextResponse.json({ resolved });
  } catch (err) {
    if (err instanceof WclNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    if (err instanceof WclRateLimitError) {
      return NextResponse.json({ error: err.message }, { status: 429 });
    }
    if (err instanceof WclReauthRequiredError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    const message = err instanceof Error ? err.message : "Error consultando Warcraft Logs";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
