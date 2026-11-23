import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getCurrentAppUserId } from "@/lib/current-app-user";
import { canUseBoostLinks } from "@/lib/boost-links";
import { cleanDisplayName, teamSlugCandidates } from "@/lib/boost-teams";
import { randomToken } from "@/lib/boost-draft";
import { BOOST_CATALOG_TAG } from "@/lib/boost-store";

const MIN_LARGO = 2;
const MAX_LARGO = 24;

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!canUseBoostLinks(session.user.appRole)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as { teamName?: unknown };
    const crudo = typeof body.teamName === "string" ? body.teamName : "";

    const teamName = cleanDisplayName(crudo).slice(0, MAX_LARGO);

    if (teamName.length < MIN_LARGO) {
      return NextResponse.json(
        { error: "El nombre del team necesita al menos 2 letras o números" },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();
    const appUserId = await getCurrentAppUserId(supabase, session.user);
    if (!appUserId) {
      return NextResponse.json(
        { error: "Tu usuario no está registrado todavía. Vuelve a iniciar sesión." },
        { status: 400 }
      );
    }

    const { data: actual } = await supabase
      .from("boost_raider_links")
      .select("slug, team_name")
      .eq("app_user_id", appUserId)
      .maybeSingle();

    if (!actual) {
      return NextResponse.json(
        { error: "Todavía no tienes link. Entra a Reservas para que se genere." },
        { status: 400 }
      );
    }

    const candidatos = teamSlugCandidates(
      teamName,
      [session.user.name, session.user.nickname],
      [randomToken(2), randomToken(2), randomToken(3), randomToken(4)]
    );

    let slug = actual.slug;
    if (!candidatos.includes(actual.slug)) {
      slug = "";
      for (const candidato of candidatos) {
        const { error } = await supabase
          .from("boost_raider_links")
          .update({ slug: candidato, team_name: teamName })
          .eq("app_user_id", appUserId);

        if (!error) {
          slug = candidato;
          break;
        }
        if (error.code !== "23505") {
          console.error("Error guardando el nombre del team:", error);
          return NextResponse.json({ error: "No se pudo guardar el team" }, { status: 500 });
        }
      }
      if (!slug) {
        return NextResponse.json(
          { error: "Ese nombre de team ya está tomado. Prueba con otro." },
          { status: 409 }
        );
      }
    } else {
      const { error } = await supabase
        .from("boost_raider_links")
        .update({ team_name: teamName })
        .eq("app_user_id", appUserId);

      if (error) {
        console.error("Error guardando el nombre del team:", error);
        return NextResponse.json({ error: "No se pudo guardar el team" }, { status: 500 });
      }
    }

    revalidateTag(BOOST_CATALOG_TAG, { expire: 0 });

    return NextResponse.json({ ok: true, teamName, slug });
  } catch (err) {
    console.error("Error cambiando el nombre del team:", err);
    return NextResponse.json({ error: "No se pudo guardar el team" }, { status: 500 });
  }
}
