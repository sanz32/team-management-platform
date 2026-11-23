import { createServerSupabaseClient } from "@/lib/supabase-server";

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

export interface ExcludedMember {
  userId: string;
  discordUsername: string;
  note: string | null;
  createdAt: string;
}

export async function getExcludedMemberIds(supabase: SupabaseClient): Promise<Set<string>> {
  const { data } = await supabase.from("raid_run_excluded_members").select("user_id");
  return new Set((data ?? []).map((r) => r.user_id as string));
}

export async function getExcludedMembers(
  supabase: SupabaseClient
): Promise<{ members: ExcludedMember[]; error: string | null }> {
  const { data: rows, error } = await supabase
    .from("raid_run_excluded_members")
    .select("user_id, note, created_at")
    .order("created_at", { ascending: false });

  if (error) return { members: [], error: error.message };
  if (!rows || rows.length === 0) return { members: [], error: null };

  const userIds = rows.map((r) => r.user_id as string);
  const { data: users, error: usersError } = await supabase
    .from("app_users")
    .select("id, discord_username, nickname")
    .in("id", userIds);

  if (usersError) return { members: [], error: usersError.message };

  const nameById = new Map(
    (users ?? []).map((u) => [u.id as string, (u.nickname as string | null) ?? (u.discord_username as string | null)])
  );

  const members = rows.map((row) => ({
    userId: row.user_id as string,
    discordUsername: nameById.get(row.user_id as string) ?? "Desconocido",
    note: (row.note as string | null) ?? null,
    createdAt: row.created_at as string,
  }));

  return { members, error: null };
}

export async function excludeMember(
  supabase: SupabaseClient,
  userId: string,
  note: string | null,
  createdBy: string | null
): Promise<string | null> {
  const { error } = await supabase
    .from("raid_run_excluded_members")
    .upsert({ user_id: userId, note, created_by: createdBy }, { onConflict: "user_id" });
  return error?.message ?? null;
}

export async function includeMember(supabase: SupabaseClient, userId: string): Promise<string | null> {
  const { error } = await supabase.from("raid_run_excluded_members").delete().eq("user_id", userId);
  return error?.message ?? null;
}
