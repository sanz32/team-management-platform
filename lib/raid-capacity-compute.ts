import type { createServerSupabaseClient } from "@/lib/supabase-server";
import { type Difficulty } from "@/lib/raids";
import { getCurrentRaidCatalog } from "@/lib/raid-catalog";
import type { RoleClassRequirement, RoleRequest } from "@/lib/roster-generator";
import { getRosterIlvlDefaults } from "@/lib/roster-ilvl-defaults";
import { getRaidRunTemplates, templateForRaid } from "@/lib/raid-run-templates";
import {
  buildBaseCandidatePool,
  groupCandidatesByRole,
  type CharacterRow,
  type UserSuggestion,
} from "@/lib/roster-candidates";
import { computeRaidRunCapacity } from "@/lib/raid-run-capacity";
import { requiresVoidspireMythicMonkHeal } from "@/lib/roster-rules";
import { fetchAllBossKills } from "@/lib/boss-kills";
import { getCurrentLockoutWeek } from "@/lib/wow-reset";
import { getGuildToday } from "@/lib/guild-day";
import { getExcludedMemberIds } from "@/lib/raid-run-excluded-members";

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

export interface RaidCapacityEntry {
  raidKey: string;
  difficulty: Difficulty;
  runs: number;
  limitingReason: string | null;
  tankAvailable: number;
  healAvailable: number;
  dpsAvailable: number;
  tankMainAvailable: number;
  healMainAvailable: number;
  dpsMainAvailable: number;
}

function restrictToMainSpec(
  suggestions: Record<string, UserSuggestion[]>
): Record<string, UserSuggestion[]> {
  const next: Record<string, UserSuggestion[]> = {};
  for (const [role, users] of Object.entries(suggestions)) {
    next[role] = users
      .map((u) => ({ ...u, characters: u.characters.filter((c) => !c.isOffSpec) }))
      .filter((u) => u.characters.length > 0);
  }
  return next;
}

export interface RaidCapacityComputeResult {
  entries: RaidCapacityEntry[];
  error: string | null;
}

export async function computeRaidCapacityEntries(
  supabase: SupabaseClient
): Promise<RaidCapacityComputeResult> {
  const today = getGuildToday();

  const { raids } = await getCurrentRaidCatalog(supabase);

  const [ilvlDefaults, templates, pools, dayOffResult, excludedMemberIds] = await Promise.all([
    getRosterIlvlDefaults(supabase),
    getRaidRunTemplates(supabase),
    Promise.all(
      raids.map((raid) => buildBaseCandidatePool(supabase, { overlapRaidKeys: [raid.key] }))
    ),
    supabase.from("availability").select("user_id").eq("available", false).eq("date", today),
    getExcludedMemberIds(supabase),
  ]);

  const poolError = pools.find((p) => p.error)?.error;
  if (poolError) return { entries: [], error: poolError };

  const unavailableUserIds = new Set((dayOffResult.data ?? []).map((r) => r.user_id as string));

  const killsByRaid = await Promise.all(
    raids.map((raid, idx) =>
      fetchAllBossKills(
        supabase,
        pools[idx].characters.map((c) => c.id),
        `boss_key.like.${raid.key}-%`
      )
    )
  );

  const entries: RaidCapacityEntry[] = [];

  raids.forEach((raid, raidIndex) => {
    const pool = pools[raidIndex];
    const kills = killsByRaid[raidIndex];
    const regionById = new Map(pool.characters.map((c) => [c.id, c.region]));

    const computableDifficulties = raid.difficulties.filter(
      (d): d is "heroic" | "mythic" => d === "heroic" || d === "mythic"
    );
    for (const difficulty of computableDifficulties) {
      const savedCharacterIds = new Set<string>();
      const prefix = `${raid.key}-${difficulty}-`;
      for (const k of kills) {
        if (!k.boss_key.startsWith(prefix)) continue;
        const region = regionById.get(k.character_id);
        if (!region) continue;
        if (k.lockout_week === getCurrentLockoutWeek(region)) savedCharacterIds.add(k.character_id);
      }

      const availableCharacters: CharacterRow[] = pool.characters.filter(
        (c) =>
          !savedCharacterIds.has(c.id) &&
          !unavailableUserIds.has(c.user_id) &&
          !excludedMemberIds.has(c.user_id)
      );

      const template = templateForRaid(templates, raid.key, difficulty);
      const minIlvl = template.minIlvl ?? ilvlDefaults[difficulty];
      const roles: RoleRequest[] = (
        [
          { role: "tank", count: template.tankCount, minIlvl },
          { role: "heal", count: template.healCount, minIlvl },
          { role: "dps", count: template.dpsCount, minIlvl },
        ] as const
      ).filter((r) => r.count > 0);

      const suggestions = groupCandidatesByRole(availableCharacters, pool.mainClassesByUser, roles, () => ({
        isSaved: false,
        isDayOff: false,
      }));

      const packingSuggestions = template.onlyMains ? restrictToMainSpec(suggestions) : suggestions;

      const requiredRoleClasses: RoleClassRequirement[] = requiresVoidspireMythicMonkHeal({
        raidKeys: [raid.key],
        difficulty,
      })
        ? [{ role: "heal", class: "Monk", count: 1 }]
        : [];

      const capacity = computeRaidRunCapacity(
        {
          roles,
          classRequirements: template.classRequirements,
          requiredRoleClasses,
          maxSameClass: template.maxSameClass ?? undefined,
        },
        packingSuggestions
      );

      const countCharacters = (source: Record<string, UserSuggestion[]>, role: string) =>
        (source[role] ?? []).reduce((sum, u) => sum + u.characters.length, 0);
      const countMainCharacters = (role: string) =>
        (suggestions[role] ?? []).reduce(
          (sum, u) => sum + u.characters.filter((c) => !c.isOffSpec).length,
          0
        );

      entries.push({
        raidKey: raid.key,
        difficulty,
        runs: capacity.runs,
        limitingReason: capacity.limitingReason,
        tankAvailable: countCharacters(packingSuggestions, "tank"),
        healAvailable: countCharacters(packingSuggestions, "heal"),
        dpsAvailable: countCharacters(packingSuggestions, "dps"),
        tankMainAvailable: countMainCharacters("tank"),
        healMainAvailable: countMainCharacters("heal"),
        dpsMainAvailable: countMainCharacters("dps"),
      });
    }
  });

  return { entries, error: null };
}
