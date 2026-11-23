import { createServerSupabaseClient } from "@/lib/supabase-server";

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

export async function findUsersAlreadyInActiveGroup(
  supabase: SupabaseClient,
  userIds: string[],
  excludeGroupId?: string
): Promise<Map<string, string>> {
  const { data: activeGroups, error: groupsError } = await supabase
    .from("mythic_plus_groups")
    .select("id, name")
    .is("archived_at", null);
  if (groupsError) throw new Error(groupsError.message);

  const activeGroupIds = (activeGroups ?? []).filter((g) => g.id !== excludeGroupId).map((g) => g.id);
  const groupNameById = new Map((activeGroups ?? []).map((g) => [g.id, g.name]));
  if (activeGroupIds.length === 0) return new Map();

  const { data: members, error: membersError } = await supabase
    .from("mythic_plus_group_members")
    .select("user_id, group_id")
    .in("group_id", activeGroupIds)
    .in("user_id", userIds);
  if (membersError) throw new Error(membersError.message);

  const conflicts = new Map<string, string>();
  for (const m of members ?? []) {
    conflicts.set(m.user_id, groupNameById.get(m.group_id) ?? "otro grupo");
  }
  return conflicts;
}
