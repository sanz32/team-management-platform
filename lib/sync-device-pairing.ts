import { createServerSupabaseClient } from "@/lib/supabase-server";

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

export async function getPairedUserIds(supabase: SupabaseClient): Promise<Set<string>> {
  const { data } = await supabase.from("sync_tokens").select("user_id");
  return new Set((data ?? []).map((row) => row.user_id as string));
}
