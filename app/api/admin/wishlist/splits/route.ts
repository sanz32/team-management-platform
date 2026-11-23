import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

interface AssignmentSpecEntry {
  specId: number | null;
  specName: string | null;
  specIconUrl: string | null;
  upgradePct: number;
  upgradeAbsolute: number | null;
  metricType: string;
}

function assignmentSpecKey(characterId: string, itemId: number, bossId: string, difficulty: string | null): string {
  return `${characterId}:${itemId}:${bossId}:${difficulty ?? ""}`;
}

interface UpgradeSpecRow {
  character_id: string;
  item_id: number;
  boss_id: string;
  difficulty: string | null;
  upgrade_pct: number;
  upgrade_absolute: number | null;
  character_sims: {
    metric_type: string;
    wow_specializations: { spec_id: number; spec_name: string; icon_url: string | null } | null;
  } | null;
}

async function fetchSpecEntriesForAssignments(
  supabase: SupabaseClient,
  assignments: AssignmentRow[]
): Promise<Map<string, AssignmentSpecEntry[]>> {
  const map = new Map<string, AssignmentSpecEntry[]>();
  if (assignments.length === 0) return map;

  const itemIds = [...new Set(assignments.map((a) => a.item_id))];
  const characterIds = [...new Set(assignments.map((a) => a.character_id))];

  const { data } = await supabase
    .from("character_wishlist_upgrades")
    .select(
      "character_id, item_id, boss_id, difficulty, upgrade_pct, upgrade_absolute, " +
        "character_sims(metric_type, wow_specializations(spec_id, spec_name, icon_url))"
    )
    .in("item_id", itemIds)
    .in("character_id", characterIds)
    .gt("upgrade_pct", 0);

  for (const row of (data ?? []) as unknown as UpgradeSpecRow[]) {
    const key = assignmentSpecKey(row.character_id, row.item_id, row.boss_id, row.difficulty);
    const spec = row.character_sims?.wow_specializations ?? null;
    const entry: AssignmentSpecEntry = {
      specId: spec?.spec_id ?? null,
      specName: spec?.spec_name ?? null,
      specIconUrl: spec?.icon_url ?? null,
      upgradePct: row.upgrade_pct,
      upgradeAbsolute: row.upgrade_absolute,
      metricType: row.character_sims?.metric_type ?? "dps",
    };
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(entry);
  }

  for (const entries of map.values()) {
    entries.sort((a, b) => b.upgradePct - a.upgradePct);
  }

  return map;
}

interface AssignmentRow {
  id: string;
  split_id: string;
  character_id: string;
  item_id: number;
  boss_id: string;
  difficulty: string | null;
  upgrade_pct: number | null;
  upgrade_absolute: number | null;
  metric_type: string | null;
  spec_id: number | null;
  created_at: string;
  characters: { id: string; name: string; class: string | null; realm_name: string | null; realm_slug: string } | null;
  wishlist_items: { name: string | null; icon_url: string | null; quality: string | null } | null;
  raid_bosses: { id: string; name: string; order_index: number } | null;
  wow_specializations: { spec_id: number; spec_name: string; role: string; icon_url: string | null } | null;
}

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const supabase = createServerSupabaseClient();

  const { data: splits, error: splitsError } = await supabase
    .from("wishlist_splits")
    .select("id, name, created_at")
    .order("created_at", { ascending: true });

  if (splitsError) return NextResponse.json({ error: splitsError.message }, { status: 500 });

  const { data: assignmentsData, error: assignmentsError } = await supabase
    .from("wishlist_split_assignments")
    .select(
      "id, split_id, character_id, item_id, boss_id, difficulty, upgrade_pct, upgrade_absolute, metric_type, spec_id, created_at, " +
        "characters(id, name, class, realm_name, realm_slug), " +
        "wishlist_items(name, icon_url, quality), " +
        "raid_bosses(id, name, order_index), " +
        "wow_specializations(spec_id, spec_name, role, icon_url)"
    );

  if (assignmentsError) return NextResponse.json({ error: assignmentsError.message }, { status: 500 });

  const assignmentsBySplit = new Map<string, AssignmentRow[]>();
  for (const row of (assignmentsData ?? []) as unknown as AssignmentRow[]) {
    if (!assignmentsBySplit.has(row.split_id)) assignmentsBySplit.set(row.split_id, []);
    assignmentsBySplit.get(row.split_id)!.push(row);
  }

  const specsByAssignment = await fetchSpecEntriesForAssignments(supabase, (assignmentsData ?? []) as unknown as AssignmentRow[]);

  const result = (splits ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    createdAt: s.created_at,
    assignments: (assignmentsBySplit.get(s.id) ?? []).map((a) => ({
      id: a.id,
      characterId: a.character_id,
      characterName: a.characters?.name ?? "?",
      characterClass: a.characters?.class ?? null,
      characterRealmName: a.characters?.realm_name ?? null,
      characterRealmSlug: a.characters?.realm_slug ?? null,
      itemId: a.item_id,
      itemName: a.wishlist_items?.name ?? "?",
      itemIconUrl: a.wishlist_items?.icon_url ?? null,
      itemQuality: a.wishlist_items?.quality ?? null,
      bossId: a.boss_id,
      bossName: a.raid_bosses?.name ?? "?",
      bossOrderIndex: a.raid_bosses?.order_index ?? 0,
      difficulty: a.difficulty,
      upgradePct: a.upgrade_pct,
      upgradeAbsolute: a.upgrade_absolute,
      metricType: a.metric_type,
      specName: a.wow_specializations?.spec_name ?? null,
      specIconUrl: a.wow_specializations?.icon_url ?? null,
      specs: specsByAssignment.get(assignmentSpecKey(a.character_id, a.item_id, a.boss_id, a.difficulty)) ?? [],
      createdAt: a.created_at,
    })),
  }));

  return NextResponse.json({ splits: result });
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
  if (!name) {
    return NextResponse.json({ error: "Falta el nombre del split" }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const { data: appUser } = await supabase
    .from("app_users")
    .select("id")
    .eq("discord_id", session.user.discordId)
    .maybeSingle();

  const { data, error } = await supabase
    .from("wishlist_splits")
    .insert({ name, created_by: appUser?.id ?? null })
    .select("id, name, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ split: { id: data.id, name: data.name, createdAt: data.created_at, assignments: [] } });
}
