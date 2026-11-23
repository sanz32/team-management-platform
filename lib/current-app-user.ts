import { createServerSupabaseClient } from "@/lib/supabase-server";

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

export async function getCurrentAppUserId(
  supabase: SupabaseClient,
  sessionUser: { discordId?: string; appUserId?: string } | undefined
): Promise<string | null> {
  if (sessionUser?.appUserId) return sessionUser.appUserId;

  const discordId = sessionUser?.discordId;
  if (!discordId) return null;

  const { data } = await supabase
    .from("app_users")
    .select("id")
    .eq("discord_id", discordId)
    .maybeSingle();

  return data?.id ?? null;
}
