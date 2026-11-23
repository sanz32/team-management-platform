import { createServerSupabaseClient } from "./supabase-server";

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

const BLIZZARD_OAUTH_TOKEN_URL = "https://oauth.battle.net/token";

export function getBlizzardOAuthRedirectUri(): string {
  return `${process.env.NEXTAUTH_URL}/api/blizzard/oauth/callback`;
}

export const MIN_LEVEL_TO_IMPORT = 80;

const ACCOUNT_REGION = "us";

export class BlizzardReauthRequiredError extends Error {}

interface BlizzardConnectionRow {
  id: string;
  battletag: string | null;
  access_token: string;
  refresh_token: string | null;
  expires_at: string;
}

async function getConnection(supabase: SupabaseClient, userId: string): Promise<BlizzardConnectionRow | null> {
  const { data, error } = await supabase
    .from("blizzard_oauth_tokens")
    .select("id, battletag, access_token, refresh_token, expires_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("Error consultando blizzard_oauth_tokens:", JSON.stringify(error, null, 2));
    return null;
  }
  return data ?? null;
}

async function refreshConnection(supabase: SupabaseClient, connection: BlizzardConnectionRow): Promise<string> {
  if (!connection.refresh_token) {
    throw new BlizzardReauthRequiredError(
      "Tu conexión con Battle.net expiró (dura 24hs). Reconéctala desde Cuentas."
    );
  }

  const clientId = process.env.BLIZZARD_CLIENT_ID!;
  const clientSecret = process.env.BLIZZARD_CLIENT_SECRET!;

  const res = await fetch(BLIZZARD_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: connection.refresh_token,
    }).toString(),
  });

  if (!res.ok) {
    throw new BlizzardReauthRequiredError(
      "La conexión con tu cuenta de Battle.net expiró o fue revocada. Reconéctala desde Cuentas."
    );
  }

  const data = await res.json();
  const expiresAt = new Date(Date.now() + (data.expires_in - 300) * 1000).toISOString();

  const { error } = await supabase
    .from("blizzard_oauth_tokens")
    .update({
      access_token: data.access_token,
      refresh_token: data.refresh_token ?? connection.refresh_token,
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", connection.id);

  if (error) console.error("Error actualizando blizzard_oauth_tokens:", JSON.stringify(error, null, 2));

  return data.access_token;
}

export interface UserBlizzardConnection {
  token: string;
  battletag: string | null;
}

export async function getUserBlizzardConnection(
  supabase: SupabaseClient,
  userId: string
): Promise<UserBlizzardConnection | null> {
  const connection = await getConnection(supabase, userId);
  if (!connection) return null;

  const expired = new Date(connection.expires_at).getTime() <= Date.now();
  const token = expired ? await refreshConnection(supabase, connection) : connection.access_token;
  return { token, battletag: connection.battletag };
}

export async function disconnectUserBlizzard(supabase: SupabaseClient, userId: string): Promise<void> {
  const { error } = await supabase.from("blizzard_oauth_tokens").delete().eq("user_id", userId);
  if (error) console.error("Error borrando blizzard_oauth_tokens:", JSON.stringify(error, null, 2));
}

export interface AccountCharacter {
  name: string;
  realmSlug: string;
  realmName: string;
  region: string;
  level: number;
  class: string | null;
  faction: string | null;
  wowAccountNumber: number | null;
}

interface BlizzardAccountCharacterResponse {
  name?: string;
  level?: number;
  playable_class?: { name?: string };
  faction?: { name?: string };
  realm?: { slug?: string; name?: string };
}
interface BlizzardAccountResponse {
  wow_accounts?: { id?: number; characters?: BlizzardAccountCharacterResponse[] }[];
}

export async function fetchAccountCharacters(accessToken: string): Promise<AccountCharacter[]> {
  const namespace = `profile-${ACCOUNT_REGION}`;
  const url = `https://${ACCOUNT_REGION}.api.blizzard.com/profile/user/wow?namespace=${namespace}&locale=en_US`;

  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });

  if (res.status === 404) {
    return [];
  }

  if (res.status === 401 || res.status === 403) {
    throw new BlizzardReauthRequiredError(
      "Tu conexión con Battle.net ya no es válida. Reconéctala desde Cuentas."
    );
  }

  if (!res.ok) {
    throw new Error(`Error consultando personajes de la cuenta de Blizzard: ${res.status}`);
  }

  const data = (await res.json()) as BlizzardAccountResponse;

  const sortedAccountIds = (data.wow_accounts ?? [])
    .map((a) => a.id)
    .filter((id): id is number => typeof id === "number")
    .sort((a, b) => a - b);
  const numberById = new Map(sortedAccountIds.map((id, i) => [id, i + 1]));

  return (data.wow_accounts ?? [])
    .flatMap((account) =>
      (account.characters ?? []).map((c) => ({
        name: c.name ?? "",
        realmSlug: c.realm?.slug ?? "",
        realmName: c.realm?.name ?? "",
        region: ACCOUNT_REGION,
        level: c.level ?? 0,
        class: c.playable_class?.name ?? null,
        faction: c.faction?.name ?? null,
        wowAccountNumber: typeof account.id === "number" ? numberById.get(account.id) ?? null : null,
      }))
    )
    .filter((c) => c.name && c.realmSlug);
}
