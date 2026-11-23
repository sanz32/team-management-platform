import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { APP_ROLES } from "@/lib/roles";
import { validateBinanceId } from "@/lib/binance-id";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const appRole = session.user.appRole;
  if (appRole !== "admin" && appRole !== "manager") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const { app_role, binance_id } = body as { app_role?: string; binance_id?: string | null };

  if (app_role === undefined && binance_id === undefined) {
    return NextResponse.json({ error: "Nada para actualizar" }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const patch: Record<string, unknown> = {};

  if (app_role !== undefined) {
    if (!APP_ROLES.includes(app_role as (typeof APP_ROLES)[number])) {
      return NextResponse.json({ error: "Rol inválido" }, { status: 400 });
    }

    if (appRole !== "admin" && app_role === "admin") {
      return NextResponse.json({ error: "Solo un admin puede asignar el rol admin" }, { status: 403 });
    }

    if (appRole !== "admin" && app_role === "friend") {
      return NextResponse.json(
        { error: "Solo un admin puede asignar el rol Compañeros" },
        { status: 403 }
      );
    }

    const { data: target, error: targetError } = await supabase
      .from("app_users")
      .select("id, app_role")
      .eq("id", id)
      .maybeSingle();

    if (targetError) return NextResponse.json({ error: targetError.message }, { status: 500 });
    if (!target) return NextResponse.json({ error: "Miembro no encontrado" }, { status: 404 });

    if (appRole !== "admin" && target.app_role === "admin") {
      return NextResponse.json({ error: "Solo un admin puede cambiar el rol de otro admin" }, { status: 403 });
    }

    if (appRole !== "admin" && target.app_role === "friend") {
      return NextResponse.json(
        { error: "Solo un admin puede cambiar el rol de un Compañeros" },
        { status: 403 }
      );
    }

    if (target.app_role === "admin" && app_role !== "admin") {
      const { count, error: countError } = await supabase
        .from("app_users")
        .select("id", { count: "exact", head: true })
        .eq("app_role", "admin");

      if (countError) return NextResponse.json({ error: countError.message }, { status: 500 });
      if ((count ?? 0) <= 1) {
        return NextResponse.json(
          { error: "No puedes quitarle admin al último administrador del guild" },
          { status: 400 }
        );
      }
    }

    patch.app_role = app_role;
  }

  if (binance_id !== undefined) {
    const validation = validateBinanceId(binance_id);
    if ("error" in validation) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    patch.binance_id = validation.value;
  }

  const { data, error } = await supabase
    .from("app_users")
    .update(patch)
    .eq("id", id)
    .select("id, discord_username, nickname, avatar_url, app_role, binance_id")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Miembro no encontrado" }, { status: 404 });

  return NextResponse.json({ member: data });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

  const { data: target, error: targetError } = await supabase
    .from("app_users")
    .select("id, app_role, discord_id, removed_at")
    .eq("id", id)
    .maybeSingle();

  if (targetError) return NextResponse.json({ error: targetError.message }, { status: 500 });
  if (!target) return NextResponse.json({ error: "Miembro no encontrado" }, { status: 404 });

  if (target.discord_id === session.user.discordId) {
    return NextResponse.json({ error: "No puedes eliminarte a ti mismo" }, { status: 400 });
  }

  if (appRole !== "admin" && target.app_role === "admin") {
    return NextResponse.json({ error: "Solo un admin puede eliminar a otro admin" }, { status: 403 });
  }

  if (appRole !== "admin" && target.app_role === "friend") {
    return NextResponse.json({ error: "Solo un admin puede eliminar a un Compañeros" }, { status: 403 });
  }

  if (target.removed_at) {
    return NextResponse.json({ error: "Este miembro ya estaba eliminado" }, { status: 400 });
  }

  const { data: actingUser } = await supabase
    .from("app_users")
    .select("id")
    .eq("discord_id", session.user.discordId)
    .maybeSingle();

  const { data, error } = await supabase
    .from("app_users")
    .update({ removed_at: new Date().toISOString(), removed_by: actingUser?.id ?? null })
    .eq("id", id)
    .select("id, discord_username, nickname, avatar_url, app_role, removed_at")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ member: data });
}
