import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { fetchCharacterData, roleFromSpec } from "@/lib/blizzard";
import { classSpecs } from "@/lib/wow-classes";
import { getCurrentAppUserId } from "@/lib/current-app-user";
import { getRemovedUserIds } from "@/lib/removed-members";
import { getFriendUserIds } from "@/lib/friend-members";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const appRole = session.user.appRole;
  const wantsAll = req.nextUrl.searchParams.get("all") === "true";

  const supabase = createServerSupabaseClient();

  if (wantsAll && (appRole === "admin" || appRole === "manager")) {
    const { data, error } = await supabase
      .from("characters")
      .select("*, app_users(discord_username, nickname, has_mochila, mochila_count)")
      .order("name");

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const [removedUserIds, friendUserIds] = await Promise.all([
      getRemovedUserIds(supabase),
      getFriendUserIds(supabase),
    ]);
    const activeData = (data ?? []).filter(
      (c) => !removedUserIds.has(c.user_id) && !friendUserIds.has(c.user_id)
    );

    const withDisplayName = activeData.map((c) => ({
      ...c,
      app_users: c.app_users
        ? {
            discord_username: c.app_users.nickname ?? c.app_users.discord_username,
            has_mochila: c.app_users.has_mochila,
            mochila_count: c.app_users.mochila_count,
          }
        : null,
    }));

    return NextResponse.json({ characters: withDisplayName });
  }

  const appUserId = await getCurrentAppUserId(supabase, session.user);

  if (!appUserId) {
    return NextResponse.json(
      { error: "Tu usuario no está registrado en app_users todavía. Vuelve a iniciar sesión.", characters: [] },
      { status: 200 }
    );
  }

  const { data, error } = await supabase
    .from("characters")
    .select("*")
    .eq("user_id", appUserId)
    .order("name");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ characters: data });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const discordId = session.user.discordId;
  const body = await req.json();
  const {
    name,
    realm_slug,
    region,
    class: clientClass,
    faction: clientFaction,
    specNames,
    wow_account_number: wowAccountNumber,
  } = body as {
    name?: string;
    realm_slug?: string;
    region?: string;
    class?: string;
    faction?: string;
    specNames?: string[];
    wow_account_number?: number | null;
  };

  if (!name || !realm_slug) {
    return NextResponse.json(
      { error: "Nombre y reino son obligatorios" },
      { status: 400 }
    );
  }

  const supabase = createServerSupabaseClient();

  const { data: appUser } = await supabase
    .from("app_users")
    .select("id")
    .eq("discord_id", discordId)
    .single();

  if (!appUser) {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  }

  const resolvedRegion = region || "us";

  let characterData = null;
  try {
    characterData = await fetchCharacterData(resolvedRegion, realm_slug, name);
  } catch (err) {
    console.error("Error consultando Blizzard al agregar personaje:", err);
  }

  const insertClass = characterData?.found ? characterData.class : clientClass || null;
  const validSpecs = classSpecs(insertClass);
  const names = Array.isArray(specNames) ? specNames.filter((n) => typeof n === "string") : [];

  if (!insertClass) {
    return NextResponse.json({ error: "No se pudo determinar la clase del personaje" }, { status: 400 });
  }
  if (names.length === 0 || names.some((n) => !validSpecs.includes(n))) {
    return NextResponse.json(
      { error: "Elige al menos una especialización válida para esta clase" },
      { status: 400 }
    );
  }

  const specs = names.map((specName) => ({ name: specName, role: roleFromSpec(specName) }));

  const insertPayload: Record<string, unknown> = {
    user_id: appUser.id,
    name,
    realm_slug,
    region: resolvedRegion,
    role: specs[0].role,
    active_spec: specs[0].name,
    specs,
  };

  if (typeof wowAccountNumber === "number") {
    insertPayload.wow_account_number = wowAccountNumber;
  }

  if (characterData?.found) {
    insertPayload.class = characterData.class;
    insertPayload.faction = characterData.faction;
    insertPayload.realm_name = characterData.realmName;
    insertPayload.ilvl = characterData.ilvl;
    insertPayload.level = characterData.level;
    insertPayload.last_updated = new Date().toISOString();
    if (typeof characterData.id === "number") {
      insertPayload.blizzard_character_id = characterData.id;
    }
  } else {
    insertPayload.class = insertClass;
    insertPayload.faction = clientFaction || null;
  }

  const { data, error } = await supabase
    .from("characters")
    .insert(insertPayload)
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "Ese personaje ya está agregado (mismo nombre, reino y región)." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    character: data,
    warning: characterData?.found
      ? undefined
      : "No se encontró el personaje en el Armory ahora mismo; se agregó con los datos disponibles y se completará en el próximo refresh.",
  });
}
