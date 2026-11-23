import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";

const MIN_LENGTH = 2;
const MAX_LENGTH = 24;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const discordId = session.user.discordId;
  const body = await req.json().catch(() => ({}));
  const rawNickname = body.nickname as string | undefined;
  const nickname = rawNickname?.trim();

  if (!nickname || nickname.length < MIN_LENGTH || nickname.length > MAX_LENGTH) {
    return NextResponse.json(
      { error: `El nick debe tener entre ${MIN_LENGTH} y ${MAX_LENGTH} caracteres` },
      { status: 400 }
    );
  }

  const supabase = createServerSupabaseClient();

  const { data: appUser } = await supabase
    .from("app_users")
    .select("id, nickname")
    .eq("discord_id", discordId)
    .maybeSingle();

  if (!appUser) {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  }

  if (appUser.nickname) {
    return NextResponse.json(
      { error: "Ya elegiste tu nick, no se puede cambiar" },
      { status: 409 }
    );
  }

  const { data, error } = await supabase
    .from("app_users")
    .update({ nickname })
    .eq("id", appUser.id)
    .is("nickname", null)
    .select()
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "Ese nick ya está en uso, elige otro" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json(
      { error: "Ya elegiste tu nick, no se puede cambiar" },
      { status: 409 }
    );
  }

  return NextResponse.json({ nickname: data.nickname });
}
