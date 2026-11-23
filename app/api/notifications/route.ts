import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const discordId = session.user.discordId;
  const supabase = createServerSupabaseClient();

  const { data: appUser } = await supabase
    .from("app_users")
    .select("id")
    .eq("discord_id", discordId)
    .maybeSingle();

  if (!appUser) {
    return NextResponse.json({ notifications: [] });
  }

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  await supabase.from("notifications").delete().lt("created_at", cutoff);

  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", appUser.id)
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const notifications = (data ?? []).map((n) => ({
    id: n.id,
    type: n.type,
    message: n.message,
    rosterId: n.roster_id,
    read: n.read,
    createdAt: n.created_at,
  }));

  return NextResponse.json({ notifications });
}
