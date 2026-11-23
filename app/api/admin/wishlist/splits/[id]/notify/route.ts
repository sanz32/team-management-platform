import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { announceSplitPublished } from "@/lib/discord-wishlist";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  const appRole = session.user.appRole;
  if (appRole !== "admin" && appRole !== "manager") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { id } = await params;
  const supabase = createServerSupabaseClient();

  const { data: split, error } = await supabase
    .from("wishlist_splits")
    .select("id, name")
    .eq("id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!split) return NextResponse.json({ error: "Split no encontrado" }, { status: 404 });

  const { data: rl } = await supabase
    .from("app_users")
    .select("discord_username")
    .eq("discord_id", session.user.discordId)
    .maybeSingle();
  const rlName = rl?.discord_username ?? "Un RL";

  const published = await announceSplitPublished(split.name, rlName);
  if (!published) {
    return NextResponse.json(
      { error: "No se pudo publicar en Discord (revisa el webhook configurado)" },
      { status: 502 }
    );
  }

  return NextResponse.json({ success: true });
}
