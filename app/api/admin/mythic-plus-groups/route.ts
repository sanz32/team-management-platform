import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getCurrentAppUserId } from "@/lib/current-app-user";
import { GROUP_SIZE } from "@/lib/mythic-plus-groups";
import { findUsersAlreadyInActiveGroup } from "@/lib/mythic-plus-group-membership";

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

interface MemberRow {
  group_id: string;
  user_id: string;
  app_users: { id: string; discord_username: string; nickname: string | null; avatar_url: string | null } | null;
}

interface RunRow {
  id: string;
  group_id: string;
  source: string;
  source_run_id: string;
  dungeon_name: string | null;
  keystone_level: number | null;
  keystone_upgrades: number;
  clear_time_ms: number | null;
  completed_at: string;
  matched_count: number;
  roster: unknown;
  avg_ilvl: number | null;
}

function displayName(user: { discord_username: string; nickname: string | null } | null): string {
  return user?.nickname ?? user?.discord_username ?? "?";
}

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const supabase = createServerSupabaseClient();

  const [{ data: groups, error: groupsError }, { data: members, error: membersError }, { data: runs, error: runsError }] =
    await Promise.all([
      supabase
        .from("mythic_plus_groups")
        .select("id, name, archived_at, created_at")
        .order("created_at", { ascending: true }),
      supabase
        .from("mythic_plus_group_members")
        .select("group_id, user_id, app_users(id, discord_username, nickname, avatar_url)"),
      supabase
        .from("mythic_plus_group_runs")
        .select(
          "id, group_id, source, source_run_id, dungeon_name, keystone_level, keystone_upgrades, clear_time_ms, completed_at, matched_count, roster, avg_ilvl"
        )
        .order("completed_at", { ascending: false }),
    ]);

  if (groupsError) return NextResponse.json({ error: groupsError.message }, { status: 500 });
  if (membersError) return NextResponse.json({ error: membersError.message }, { status: 500 });
  if (runsError) return NextResponse.json({ error: runsError.message }, { status: 500 });

  const membersByGroup = new Map<string, MemberRow[]>();
  for (const row of (members ?? []) as unknown as MemberRow[]) {
    if (!membersByGroup.has(row.group_id)) membersByGroup.set(row.group_id, []);
    membersByGroup.get(row.group_id)!.push(row);
  }

  const runsByGroup = new Map<string, RunRow[]>();
  for (const row of (runs ?? []) as unknown as RunRow[]) {
    if (!runsByGroup.has(row.group_id)) runsByGroup.set(row.group_id, []);
    runsByGroup.get(row.group_id)!.push(row);
  }

  const result = (groups ?? []).map((g) => ({
    id: g.id,
    name: g.name,
    archivedAt: g.archived_at,
    createdAt: g.created_at,
    members: (membersByGroup.get(g.id) ?? []).map((m) => ({
      userId: m.user_id,
      displayName: displayName(m.app_users),
      avatarUrl: m.app_users?.avatar_url ?? null,
    })),
    runs: (runsByGroup.get(g.id) ?? []).map((r) => ({
      id: r.id,
      groupId: r.group_id,
      source: r.source,
      sourceRunId: r.source_run_id,
      dungeonName: r.dungeon_name,
      keystoneLevel: r.keystone_level,
      keystoneUpgrades: r.keystone_upgrades,
      clearTimeMs: r.clear_time_ms,
      completedAt: r.completed_at,
      matchedCount: r.matched_count,
      roster: r.roster,
      avgIlvl: r.avg_ilvl,
    })),
  }));

  return NextResponse.json({ groups: result });
}

async function fetchGroupWithMembers(supabase: SupabaseClient, groupId: string) {
  const { data: group, error: groupError } = await supabase
    .from("mythic_plus_groups")
    .select("id, name, archived_at, created_at")
    .eq("id", groupId)
    .single();
  if (groupError) throw new Error(groupError.message);

  const { data: members, error: membersError } = await supabase
    .from("mythic_plus_group_members")
    .select("user_id, app_users(id, discord_username, nickname, avatar_url)")
    .eq("group_id", groupId);
  if (membersError) throw new Error(membersError.message);

  return {
    id: group.id,
    name: group.name,
    archivedAt: group.archived_at,
    createdAt: group.created_at,
    members: ((members ?? []) as unknown as MemberRow[]).map((m) => ({
      userId: m.user_id,
      displayName: displayName(m.app_users),
      avatarUrl: m.app_users?.avatar_url ?? null,
    })),
    runs: [] as unknown[],
  };
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  const appRole = session.user.appRole;
  if (appRole !== "admin" && appRole !== "manager") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const name = (body as { name?: string }).name?.trim();
  const userIds = (body as { userIds?: unknown }).userIds;

  if (!name) {
    return NextResponse.json({ error: "Falta el nombre del grupo" }, { status: 400 });
  }
  if (!Array.isArray(userIds) || userIds.length !== GROUP_SIZE || new Set(userIds).size !== GROUP_SIZE) {
    return NextResponse.json({ error: `Un grupo necesita exactamente ${GROUP_SIZE} integrantes distintos` }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();

  try {
    const conflicts = await findUsersAlreadyInActiveGroup(supabase, userIds);
    if (conflicts.size > 0) {
      const names = [...new Set(conflicts.values())].join(", ");
      return NextResponse.json({ error: `Ya hay integrantes en otro grupo activo (${names})` }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error desconocido" }, { status: 500 });
  }

  const appUserId = await getCurrentAppUserId(supabase, session.user);

  const { data: group, error: groupError } = await supabase
    .from("mythic_plus_groups")
    .insert({ name, created_by: appUserId })
    .select("id")
    .single();
  if (groupError) return NextResponse.json({ error: groupError.message }, { status: 500 });

  const { error: membersError } = await supabase
    .from("mythic_plus_group_members")
    .insert(userIds.map((userId) => ({ group_id: group.id, user_id: userId })));
  if (membersError) return NextResponse.json({ error: membersError.message }, { status: 500 });

  try {
    const created = await fetchGroupWithMembers(supabase, group.id);
    return NextResponse.json({ group: created });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error desconocido" }, { status: 500 });
  }
}
