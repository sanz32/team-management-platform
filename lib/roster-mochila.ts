import { createServerSupabaseClient } from "@/lib/supabase-server";
import { RosterSelection } from "@/lib/roster-generator";

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

export interface MochilaAssignee {
  userId: string;
  discordUsername: string;
  characterId: string;
  characterName: string;
}

export interface MochilaInput {
  requestedCount: number;
  assignees: MochilaAssignee[];
}

export async function resolveValidMochilaAssignees(
  supabase: SupabaseClient,
  mochila: MochilaInput | null | undefined,
  selected: RosterSelection[]
): Promise<MochilaAssignee[]> {
  if (!mochila?.assignees?.length) return [];

  const selectedUserIds = new Set(selected.map((s) => s.candidate?.user_id).filter(Boolean));
  const candidateAssignees = mochila.assignees.filter((a) => selectedUserIds.has(a.userId));
  if (candidateAssignees.length === 0) return [];

  const { data: users } = await supabase
    .from("app_users")
    .select("id, has_mochila")
    .in("id", candidateAssignees.map((a) => a.userId));

  const mochilaUserIds = new Set((users ?? []).filter((u) => u.has_mochila).map((u) => u.id));
  return candidateAssignees.filter((a) => mochilaUserIds.has(a.userId));
}

export function diffMochilaAssignees(
  oldAssignees: MochilaAssignee[],
  newAssignees: MochilaAssignee[]
): { added: string[]; removed: string[] } {
  const oldIds = new Set(oldAssignees.map((a) => a.userId));
  const newIds = new Set(newAssignees.map((a) => a.userId));
  return {
    added: newAssignees.map((a) => a.userId).filter((id) => !oldIds.has(id)),
    removed: oldAssignees.map((a) => a.userId).filter((id) => !newIds.has(id)),
  };
}
