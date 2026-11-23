import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const session = await auth();
  if (!session?.user?.discordId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { userId: rawUserId } = await params;
  const supabase = createServerSupabaseClient();

  const { data: appUser, error: userError } = await supabase
    .from("app_users")
    .select("id")
    .eq("discord_id", session.user.discordId)
    .maybeSingle();

  if (userError) return NextResponse.json({ error: userError.message }, { status: 500 });
  if (!appUser) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });

  const userId = rawUserId === "me" ? (appUser.id as string) : rawUserId;

  const isSelf = userId === appUser.id;
  if (!isSelf && session.user.appRole !== "admin") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { error: deleteError } = await supabase
    .from("sync_tokens")
    .delete()
    .eq("user_id", userId);

  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

  const { error: pairingError } = await supabase
    .from("sync_device_pairings")
    .delete()
    .eq("user_id", userId);

  if (pairingError) return NextResponse.json({ error: pairingError.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
