import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getMainClassesByUser } from "@/lib/main-classes";
import { pruneExpiredRosters } from "@/lib/saved-rosters-expiry";
import { getRemovedUserIds } from "@/lib/removed-members";
import { getFriendUserIds } from "@/lib/friend-members";
import type { Candidate, CharacterTier } from "@/lib/roster-generator";

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

export interface SuggestedCandidate extends Candidate {
  isSaved: boolean | null;
}

export interface UserSuggestion {
  user_id: string;
  discord_username: string;
  characters: SuggestedCandidate[];
}

export interface CharacterRow {
  id: string;
  user_id: string;
  name: string;
  realm_slug: string;
  region: string;
  ilvl: number;
  class: string | null;
  active_spec: string | null;
  role: string;
  specs: { name: string; role: string }[] | null;
  roster_tier: CharacterTier | null;
  app_users?: {
    discord_username: string | null;
    nickname: string | null;
    has_mochila: boolean | null;
    mochila_count: number | null;
  } | null;
}

export interface BaseCandidatePoolOptions {
  excludeUserIds?: Set<string>;
  overlapRaidKeys?: string[];
}

export interface BaseCandidatePool {
  characters: CharacterRow[];
  mainClassesByUser: Map<string, Set<string>>;
  error: string | null;
}

export async function buildBaseCandidatePool(
  supabase: SupabaseClient,
  options: BaseCandidatePoolOptions = {}
): Promise<BaseCandidatePool> {
  const { data: characters, error } = await supabase
    .from("characters")
    .select("*, app_users(discord_username, nickname, has_mochila, mochila_count)")
    .not("role", "is", null)
    .not("ilvl", "is", null);

  if (error) {
    return { characters: [], mainClassesByUser: new Map(), error: error.message };
  }

  const [removedUserIds, friendUserIds] = await Promise.all([
    getRemovedUserIds(supabase),
    getFriendUserIds(supabase),
  ]);

  const excludedUserIdSet = options.excludeUserIds ?? new Set<string>();
  const rosterCharacters = ((characters ?? []) as CharacterRow[]).filter(
    (c) =>
      !excludedUserIdSet.has(c.user_id) &&
      !removedUserIds.has(c.user_id) &&
      !friendUserIds.has(c.user_id)
  );

  const mainClassesByUser = await getMainClassesByUser(supabase);

  await pruneExpiredRosters(supabase);

  const requestedRaidKeys = new Set(options.overlapRaidKeys ?? []);
  const { data: pastRosters } = await supabase.from("saved_rosters").select("selected, content");
  const usedCharacterIds = new Set<string>();
  for (const r of pastRosters ?? []) {
    const oldRaidKeys: string[] = (r.content as { raidKeys?: string[] } | null)?.raidKeys ?? [];
    const overlaps = oldRaidKeys.some((k) => requestedRaidKeys.has(k));
    if (!overlaps) continue;
    for (const entry of (r.selected ?? []) as { candidate?: { id?: string } }[]) {
      if (entry?.candidate?.id) usedCharacterIds.add(entry.candidate.id);
    }
  }

  const eligibleCharacters = rosterCharacters.filter(
    (c) => !usedCharacterIds.has(c.id) && c.roster_tier !== "excluido"
  );

  return { characters: eligibleCharacters, mainClassesByUser, error: null };
}

export interface CandidateExtras {
  isSaved: boolean | null;
  isDayOff: boolean;
}

export interface RoleFilter {
  role: string;
  minIlvl: number;
}

export function groupCandidatesByRole(
  characters: CharacterRow[],
  mainClassesByUser: Map<string, Set<string>>,
  roles: RoleFilter[],
  extras: (c: CharacterRow) => CandidateExtras
): Record<string, UserSuggestion[]> {
  function toSuggestedCandidate(c: CharacterRow, offSpecName?: string): SuggestedCandidate {
    const extra = extras(c);
    return {
      id: c.id,
      user_id: c.user_id,
      name: c.name,
      realm_slug: c.realm_slug,
      region: c.region,
      ilvl: c.ilvl,
      class: c.class,
      active_spec: c.active_spec,
      role: c.role,
      discord_username: c.app_users?.nickname ?? c.app_users?.discord_username ?? "Desconocido",
      isSaved: extra.isSaved,
      isOffSpec: !!offSpecName,
      specUsed: offSpecName ?? c.active_spec,
      hasMochila: c.app_users?.has_mochila ?? false,
      mochilaCount: c.app_users?.mochila_count ?? 0,
      isMainClass: c.class ? (mainClassesByUser.get(c.user_id)?.has(c.class) ?? false) : false,
      ownerMainClasses: Array.from(mainClassesByUser.get(c.user_id) ?? []),
      tier: c.class ? c.roster_tier ?? "normal" : "ultimo_recurso",
      isDayOff: extra.isDayOff,
    };
  }

  const suggestions: Record<string, UserSuggestion[]> = {};

  for (const roleReq of roles) {
    const byUser = new Map<string, UserSuggestion>();
    for (const c of characters) {
      if (c.ilvl < roleReq.minIlvl) continue;

      let suggested: SuggestedCandidate | null = null;
      if (c.role === roleReq.role) {
        suggested = toSuggestedCandidate(c);
      } else if (c.specs && c.specs.length > 1) {
        const offSpec = c.specs.slice(1).find((s: { name: string; role: string }) => s.role === roleReq.role);
        if (offSpec) suggested = toSuggestedCandidate(c, offSpec.name);
      }
      if (!suggested) continue;

      const existing = byUser.get(c.user_id);
      if (existing) {
        existing.characters.push(suggested);
      } else {
        byUser.set(c.user_id, {
          user_id: c.user_id,
          discord_username: suggested.discord_username,
          characters: [suggested],
        });
      }
    }
    for (const u of byUser.values()) {
      u.characters.sort(
        (a, b) => Number(b.isMainClass) - Number(a.isMainClass) || b.ilvl - a.ilvl
      );
    }
    suggestions[roleReq.role] = Array.from(byUser.values()).sort((a, b) =>
      a.discord_username.localeCompare(b.discord_username)
    );
  }

  return suggestions;
}
