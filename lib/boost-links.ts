import { createServerSupabaseClient } from "@/lib/supabase-server";
import { randomToken } from "@/lib/boost-draft";
import { suggestTeamName, teamSlugCandidates } from "@/lib/boost-teams";

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

export function canUseBoostLinks(appRole: string | undefined): boolean {
  return appRole === "admin" || appRole === "manager" || appRole === "member";
}

export function canManageBoostCatalog(appRole: string | undefined): boolean {
  return appRole === "admin" || appRole === "manager";
}

export function canWipeBoostCatalog(appRole: string | undefined): boolean {
  return appRole === "admin";
}

export interface RaiderLink {
  slug: string;
  appUserId: string;
  teamName: string | null;
}

const FALLBACK_RAIDER_NICKNAME = process.env.BOOST_FALLBACK_RAIDER_NICKNAME || "Admin";

export interface FallbackRaider {
  appUserId: string;
  discordId: string | null;
}

export async function getFallbackRaider(
  supabase: SupabaseClient
): Promise<FallbackRaider | null> {
  const { data } = await supabase
    .from("app_users")
    .select("id, discord_id, removed_at")
    .eq("nickname", FALLBACK_RAIDER_NICKNAME)
    .maybeSingle();

  if (!data || data.removed_at) return null;
  return { appUserId: data.id, discordId: data.discord_id ?? null };
}

export async function ensureRaiderLink(
  supabase: SupabaseClient,
  appUserId: string,
  displayName: string
): Promise<RaiderLink | null> {
  const { data: existing } = await supabase
    .from("boost_raider_links")
    .select("slug, app_user_id, team_name")
    .eq("app_user_id", appUserId)
    .maybeSingle();

  if (existing) {
    return {
      slug: existing.slug,
      appUserId: existing.app_user_id,
      teamName: existing.team_name ?? null,
    };
  }

  const { data: usuario } = await supabase
    .from("app_users")
    .select("discord_global_name, discord_username, nickname")
    .eq("id", appUserId)
    .maybeSingle();

  const nombres = (usuario ?? {}) as {
    discord_global_name?: string | null;
    discord_username?: string | null;
    nickname?: string | null;
  };

  const teamName =
    suggestTeamName({
      globalName: nombres.discord_global_name,
      nickname: nombres.nickname,
      username: nombres.discord_username,
    }) || displayName;

  const candidates = teamSlugCandidates(
    teamName,
    [nombres.discord_username, nombres.nickname, displayName],
    [randomToken(2), randomToken(2), randomToken(3), randomToken(4)]
  );

  for (const slug of candidates) {
    const { data, error } = await supabase
      .from("boost_raider_links")
      .insert({ app_user_id: appUserId, slug, team_name: teamName })
      .select("slug, app_user_id, team_name")
      .single();

    if (!error && data) {
      return { slug: data.slug, appUserId: data.app_user_id, teamName: data.team_name ?? null };
    }

    if (error && error.code !== "23505") {
      console.error("Error creando el link del Raider:", error);
      return null;
    }

    const { data: raced } = await supabase
      .from("boost_raider_links")
      .select("slug, app_user_id, team_name")
      .eq("app_user_id", appUserId)
      .maybeSingle();
    if (raced) {
      return { slug: raced.slug, appUserId: raced.app_user_id, teamName: raced.team_name ?? null };
    }
  }

  console.error("No se pudo generar un slug libre para el Raider", appUserId);
  return null;
}

export interface StorefrontRaider {
  name: string;
  username: string | null;
  discordId: string | null;
  avatarUrl: string | null;
  frameColor1: string | null;
  frameColor2: string | null;
  teamName: string | null;
}

const RAIDER_CARD_COLUMNS =
  "nickname, discord_username, discord_global_name, discord_id, avatar_url, frame_color_1, frame_color_2, removed_at";

interface RaiderCardRow {
  nickname: string | null;
  discord_username: string | null;
  discord_global_name: string | null;
  discord_id: string | null;
  avatar_url: string | null;
  frame_color_1: string | null;
  frame_color_2: string | null;
  removed_at: string | null;
}

function toStorefrontRaider(
  row: RaiderCardRow | null | undefined,
  teamName: string | null = null
): StorefrontRaider | null {
  if (!row || row.removed_at) return null;
  const name = row.discord_global_name?.trim() || row.nickname || row.discord_username;
  if (!name) return null;
  return {
    name,
    username: row.discord_username,
    discordId: row.discord_id,
    avatarUrl: row.avatar_url,
    frameColor1: row.frame_color_1,
    frameColor2: row.frame_color_2,
    teamName,
  };
}

export async function getStorefrontRaider(
  supabase: SupabaseClient,
  refSlug: string | null
): Promise<StorefrontRaider | null> {
  if (refSlug) {
    const { data } = await supabase
      .from("boost_raider_links")
      .select(`team_name, app_users(${RAIDER_CARD_COLUMNS})`)
      .eq("slug", refSlug)
      .maybeSingle();

    const fila = data as {
      team_name?: string | null;
      app_users?: RaiderCardRow | null;
    } | null;
    const porLink = toStorefrontRaider(fila?.app_users, fila?.team_name ?? null);
    if (porLink) return porLink;
  }

  const { data } = await supabase
    .from("app_users")
    .select(`${RAIDER_CARD_COLUMNS}, boost_raider_links(team_name)`)
    .eq("nickname", FALLBACK_RAIDER_NICKNAME)
    .maybeSingle();

  type LinkEmbed = { team_name: string | null };
  const fila = data as
    | (RaiderCardRow & { boost_raider_links?: LinkEmbed | LinkEmbed[] | null })
    | null;

  const embed = fila?.boost_raider_links;
  const teamName = (Array.isArray(embed) ? embed[0]?.team_name : embed?.team_name) ?? null;
  return toStorefrontRaider(fila, teamName);
}
