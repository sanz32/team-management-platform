import { createServerSupabaseClient } from "@/lib/supabase-server";

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

export async function getFriendUserIds(supabase: SupabaseClient): Promise<Set<string>> {
  const { data } = await supabase.from("app_users").select("id").eq("app_role", "friend");
  return new Set((data ?? []).map((r) => r.id as string));
}
