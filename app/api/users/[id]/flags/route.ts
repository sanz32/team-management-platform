import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";

const FLAGS = {
  hasMochila: { column: "has_mochila", ownerCanSet: true },
} as const;

type FlagName = keyof typeof FLAGS;

function isFlagName(value: unknown): value is FlagName {
  return typeof value === "string" && value in FLAGS;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const { flag, value } = body as { flag?: unknown; value?: unknown };

  if (!isFlagName(flag)) {
    return NextResponse.json({ error: "Bandera desconocida" }, { status: 400 });
  }
  if (typeof value !== "boolean") {
    return NextResponse.json({ error: "Falta value (boolean)" }, { status: 400 });
  }

  const definition = FLAGS[flag];
  const discordId = session.user.discordId;
  const appRole = session.user.appRole;
  const canManageAny = appRole === "admin" || appRole === "manager";

  const supabase = createServerSupabaseClient();

  const { data: appUser } = await supabase
    .from("app_users")
    .select("id")
    .eq("discord_id", discordId)
    .maybeSingle();

  if (!appUser) {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  }

  const isOwner = id === appUser.id;
  const allowed = canManageAny || (isOwner && definition.ownerCanSet);

  if (!allowed) {
    return NextResponse.json(
      { error: "No tienes permiso para cambiar esto" },
      { status: 403 }
    );
  }

  const { data, error } = await supabase
    .from("app_users")
    .update({ [definition.column]: value })
    .eq("id", id)
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ id: data.id, flag, value });
}
