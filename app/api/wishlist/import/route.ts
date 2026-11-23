import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { detectSimProvider, UnknownSimProviderError } from "@/lib/sims";
import { importNormalizedSim, CharacterNotFoundError, CharacterNotOwnedError, SpecNotResolvedError } from "@/lib/sims/import";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const url: string = typeof body?.url === "string" ? body.url.trim() : "";
  if (!url) {
    return NextResponse.json({ error: "Pega un link de Raidbots o de QE Live." }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const { data: appUser } = await supabase
    .from("app_users")
    .select("id")
    .eq("discord_id", session.user.discordId)
    .maybeSingle();
  if (!appUser) {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  }

  try {
    const provider = detectSimProvider(url);
    const id = provider.extractId(url);
    const rawJson = await provider.fetchRawResult(id);
    const normalized = await provider.parse(rawJson);

    const isAdmin = session.user.appRole === "admin";
    const result = await importNormalizedSim(
      supabase,
      appUser.id,
      isAdmin,
      provider.id,
      provider.metricType,
      id,
      url,
      rawJson,
      normalized
    );

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof UnknownSimProviderError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    if (err instanceof CharacterNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    if (err instanceof CharacterNotOwnedError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    if (err instanceof SpecNotResolvedError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("Error importando sim de Wishlist:", err);
    const message = err instanceof Error ? err.message : "No se pudo importar esa simulación.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
