import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getDiscoveredCurrencies, resolveCurrencyIcon } from "@/lib/currencies";

export async function GET() {
  const session = await auth();
  const appRole = session?.user?.appRole;
  if (appRole !== "admin" && appRole !== "manager") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const supabase = createServerSupabaseClient();
  try {
    return NextResponse.json({ currencies: await getDiscoveredCurrencies(supabase) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error listando monedas";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  const appRole = session?.user?.appRole;
  if (appRole !== "admin" && appRole !== "manager") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { currencyId, tracked } = body as { currencyId?: number; tracked?: boolean };

  if (typeof currencyId !== "number" || typeof tracked !== "boolean") {
    return NextResponse.json({ error: "Faltan currencyId (número) y tracked (booleano)" }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();

  if (!tracked) {
    const { error } = await supabase.from("tracked_currencies").delete().eq("currency_id", currencyId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ currencyId, tracked: false, iconUrl: null });
  }

  const { data: appUser } = await supabase
    .from("app_users")
    .select("id")
    .eq("discord_id", session!.user!.discordId!)
    .maybeSingle();

  const { error } = await supabase.from("tracked_currencies").upsert(
    { currency_id: currencyId, updated_at: new Date().toISOString(), updated_by: appUser?.id ?? null },
    { onConflict: "currency_id" }
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const iconUrl = await resolveCurrencyIcon(supabase, currencyId);

  return NextResponse.json({ currencyId, tracked: true, iconUrl });
}
