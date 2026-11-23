import { createServerSupabaseClient } from "@/lib/supabase-server";

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

export async function getRemovedUserIds(supabase: SupabaseClient): Promise<Set<string>> {
  const { data } = await supabase.from("app_users").select("id").not("removed_at", "is", null);
  return new Set((data ?? []).map((r) => r.id as string));
}
