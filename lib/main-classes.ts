import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getRemovedUserIds } from "@/lib/removed-members";
import { getFriendUserIds } from "@/lib/friend-members";

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

export const MIN_CHARACTERS_FOR_SECONDARY_MAIN = 3;

export const MIN_ILVL_RATIO_FOR_SECONDARY_MAIN = 0.98;

export const MAX_MAIN_CLASSES = 3;

export interface MainClassCharacter {
  class: string | null;
  ilvl: number | null;
}

export function deriveMainClasses(characters: MainClassCharacter[]): string[] {
  const countByClass = new Map<string, number>();
  const ilvlSumByClass = new Map<string, number>();

  for (const c of characters) {
    if (!c.class) continue;
    const ilvl = c.ilvl ?? 0;
    countByClass.set(c.class, (countByClass.get(c.class) ?? 0) + 1);
    ilvlSumByClass.set(c.class, (ilvlSumByClass.get(c.class) ?? 0) + ilvl);
  }

  if (countByClass.size === 0) return [];

  const avgIlvlByClass = new Map(
    Array.from(countByClass.entries()).map(([cls, count]) => [
      cls,
      (ilvlSumByClass.get(cls) ?? 0) / count,
    ])
  );

  const ranked = Array.from(countByClass.entries()).sort(
    ([clsA, countA], [clsB, countB]) =>
      countB - countA || (avgIlvlByClass.get(clsB) ?? 0) - (avgIlvlByClass.get(clsA) ?? 0)
  );

  const primaryClass = ranked[0][0];
  const referenceIlvl = avgIlvlByClass.get(primaryClass) ?? 0;

  const mains = [primaryClass];
  for (const [cls, count] of ranked.slice(1)) {
    if (mains.length >= MAX_MAIN_CLASSES) break;
    if (count < MIN_CHARACTERS_FOR_SECONDARY_MAIN) continue;
    if (referenceIlvl > 0 && (avgIlvlByClass.get(cls) ?? 0) < referenceIlvl * MIN_ILVL_RATIO_FOR_SECONDARY_MAIN) {
      continue;
    }
    mains.push(cls);
  }

  return mains;
}

export async function getMainClassesByUser(
  supabase: SupabaseClient
): Promise<Map<string, Set<string>>> {
  let { data } = await supabase.from("user_main_classes").select("user_id, class");
  if ((data ?? []).length === 0) {
    await refreshAutoMainClasses(supabase);
    ({ data } = await supabase.from("user_main_classes").select("user_id, class"));
  }

  const byUser = new Map<string, Set<string>>();
  for (const row of data ?? []) {
    const userId = row.user_id as string;
    const set = byUser.get(userId) ?? new Set<string>();
    set.add(row.class as string);
    byUser.set(userId, set);
  }
  return byUser;
}

export async function getMainClassesForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<Set<string>> {
  const { data } = await supabase.from("user_main_classes").select("class").eq("user_id", userId);
  return new Set((data ?? []).map((r) => r.class as string));
}

export async function refreshAutoMainClasses(supabase: SupabaseClient): Promise<void> {
  const { data: characters } = await supabase
    .from("characters")
    .select("user_id, class, ilvl")
    .not("class", "is", null);

  const { data: existing } = await supabase
    .from("user_main_classes")
    .select("user_id, class, source");

  const manualUserIds = new Set(
    (existing ?? []).filter((r) => r.source === "manual").map((r) => r.user_id as string)
  );

  const [removedUserIds, friendUserIds] = await Promise.all([
    getRemovedUserIds(supabase),
    getFriendUserIds(supabase),
  ]);

  const charactersByUser = new Map<string, MainClassCharacter[]>();
  for (const c of characters ?? []) {
    const userId = c.user_id as string;
    if (manualUserIds.has(userId) || removedUserIds.has(userId) || friendUserIds.has(userId)) continue;
    const list = charactersByUser.get(userId) ?? [];
    list.push({ class: c.class as string | null, ilvl: c.ilvl as number | null });
    charactersByUser.set(userId, list);
  }

  const rows: { user_id: string; class: string; source: string; updated_at: string }[] = [];
  const now = new Date().toISOString();
  for (const [userId, chars] of charactersByUser) {
    for (const cls of deriveMainClasses(chars)) {
      rows.push({ user_id: userId, class: cls, source: "auto", updated_at: now });
    }
  }

  const keep = new Set(rows.map((r) => `${r.user_id}|${r.class}`));
  const stale = (existing ?? []).filter(
    (r) =>
      r.source === "auto" &&
      !manualUserIds.has(r.user_id as string) &&
      !keep.has(`${r.user_id}|${r.class}`)
  );
  for (const row of stale) {
    await supabase
      .from("user_main_classes")
      .delete()
      .eq("user_id", row.user_id as string)
      .eq("class", row.class as string);
  }

  if (rows.length > 0) {
    await supabase.from("user_main_classes").upsert(rows, { onConflict: "user_id,class" });
  }
}
