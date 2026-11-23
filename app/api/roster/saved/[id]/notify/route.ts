import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { announceRoster, deleteRosterAnnouncement } from "@/lib/discord-notify";
import { getCurrentRaidCatalog } from "@/lib/raid-catalog";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const appRole = session.user.appRole;
  if (appRole !== "admin" && appRole !== "manager") {
    return NextResponse.json(
      { error: "Solo el líder o los managers pueden notificar un roster" },
      { status: 403 }
    );
  }

  const { id } = await params;
  const supabase = createServerSupabaseClient();

  const { data: roster, error } = await supabase
    .from("saved_rosters")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!roster) return NextResponse.json({ error: "Roster no encontrado" }, { status: 404 });

  if (roster.discord_message_id) {
    await deleteRosterAnnouncement(roster.discord_message_id);
  }

  const { raids } = await getCurrentRaidCatalog(supabase);
  const messageId = await announceRoster(
    {
      scheduledFor: roster.scheduled_for,
      selected: roster.selected,
      averageIlvl: Number(roster.average_ilvl),
      content: roster.content,
      mochilaAssignees: roster.mochila_assignees ?? [],
    },
    raids
  );

  if (!messageId) {
    return NextResponse.json(
      { error: "No se pudo publicar en Discord (revisa el webhook configurado)" },
      { status: 502 }
    );
  }

  await supabase.from("saved_rosters").update({ discord_message_id: messageId }).eq("id", id);

  return NextResponse.json({ success: true });
}
