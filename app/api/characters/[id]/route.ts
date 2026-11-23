import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { roleFromSpec } from "@/lib/blizzard";
import { classSpecs } from "@/lib/wow-classes";

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
  const { specNames, class: clientClass } = body as { specNames?: string[]; class?: string };

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

  const { data: character, error: fetchError } = await supabase
    .from("characters")
    .select("id, user_id, class")
    .eq("id", id)
    .maybeSingle();

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  if (!character) {
    return NextResponse.json({ error: "Personaje no encontrado" }, { status: 404 });
  }

  const isOwner = character.user_id === appUser.id;

  if (!isOwner && !canManageAny) {
    return NextResponse.json(
      { error: "No tienes permiso para editar este personaje" },
      { status: 403 }
    );
  }

  const resolvedClass = character.class ?? clientClass ?? null;
  const validSpecs = classSpecs(resolvedClass);
  const names = Array.isArray(specNames) ? specNames.filter((n) => typeof n === "string") : [];

  if (!resolvedClass) {
    return NextResponse.json(
      { error: "Este personaje no tiene clase asignada; especifica una clase." },
      { status: 400 }
    );
  }
  if (names.length === 0 || names.some((n) => !validSpecs.includes(n))) {
    return NextResponse.json(
      { error: "Elige al menos una especialización válida para esta clase" },
      { status: 400 }
    );
  }

  const specs = names.map((specName) => ({ name: specName, role: roleFromSpec(specName) }));

  const updatePayload: Record<string, unknown> = {
    role: specs[0].role,
    active_spec: specs[0].name,
    specs,
  };
  if (!character.class) updatePayload.class = resolvedClass;

  const { data, error } = await supabase
    .from("characters")
    .update(updatePayload)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ character: data });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { id } = await params;
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

  const { data: character, error: fetchError } = await supabase
    .from("characters")
    .select("id, user_id")
    .eq("id", id)
    .maybeSingle();

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  if (!character) {
    return NextResponse.json({ error: "Personaje no encontrado" }, { status: 404 });
  }

  const isOwner = character.user_id === appUser.id;

  if (!isOwner && !canManageAny) {
    return NextResponse.json(
      { error: "No tienes permiso para eliminar este personaje" },
      { status: 403 }
    );
  }

  const { error: deleteError } = await supabase
    .from("characters")
    .delete()
    .eq("id", id);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
