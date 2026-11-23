import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { canWipeBoostCatalog } from "@/lib/boost-links";
import { fetchDiscordUserNames } from "@/lib/discord-bot";
import { BOOST_CATALOG_TAG } from "@/lib/boost-store";

const TANDA = 5;

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!canWipeBoostCatalog(session.user.appRole)) {
    return NextResponse.json({ error: "Solo un admin puede ver los teams" }, { status: 403 });
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("boost_raider_links")
    .select("slug, team_name, app_users(nickname, discord_username, discord_global_name)")
    .order("slug");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ teams: data ?? [] });
}

export async function POST() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!canWipeBoostCatalog(session.user.appRole)) {
    return NextResponse.json(
      { error: "Solo un admin puede resincronizar los nombres de Discord" },
      { status: 403 }
    );
  }

  try {
    const supabase = createServerSupabaseClient();
    const { data: usuarios, error } = await supabase
      .from("app_users")
      .select("id, discord_id, discord_username, discord_global_name")
      .is("removed_at", null);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const filas = (usuarios ?? []) as {
      id: string;
      discord_id: string;
      discord_username: string | null;
      discord_global_name: string | null;
    }[];

    let actualizados = 0;
    let sinCambios = 0;
    let noEncontrados = 0;

    for (let i = 0; i < filas.length; i += TANDA) {
      const tanda = filas.slice(i, i + TANDA);
      const leidos = await Promise.all(
        tanda.map(async (fila) => ({
          fila,
          nombres: await fetchDiscordUserNames(fila.discord_id),
        }))
      );

      for (const { fila, nombres } of leidos) {
        if (!nombres) {
          noEncontrados += 1;
          continue;
        }
        if (nombres.globalName === fila.discord_global_name) {
          sinCambios += 1;
          continue;
        }
        const { error: updateError } = await supabase
          .from("app_users")
          .update({ discord_global_name: nombres.globalName })
          .eq("id", fila.id);

        if (updateError) {
          console.error(`No se pudo guardar el nombre de Discord de ${fila.id}:`, updateError);
          continue;
        }
        actualizados += 1;
      }
    }

    if (actualizados > 0) revalidateTag(BOOST_CATALOG_TAG, { expire: 0 });

    return NextResponse.json({
      ok: true,
      revisados: filas.length,
      actualizados,
      sinCambios,
      noEncontrados,
    });
  } catch (err) {
    console.error("Error resincronizando los nombres de Discord:", err);
    return NextResponse.json(
      { error: "No se pudieron resincronizar los nombres de Discord" },
      { status: 500 }
    );
  }
}
