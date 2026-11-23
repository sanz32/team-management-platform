import { createServerSupabaseClient } from "@/lib/supabase-server";
import type { Difficulty } from "@/lib/raids";
import type { ClassRequirement } from "@/lib/roster-generator";

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

export interface RaidRunTemplateConfig {
  tankCount: number;
  healCount: number;
  dpsCount: number;
  maxSameClass: number | null;
  minIlvl: number | null;
  onlyMains: boolean;
  classRequirements: ClassRequirement[];
}

export const DEFAULT_RAID_RUN_TEMPLATE: RaidRunTemplateConfig = {
  tankCount: 2,
  healCount: 4,
  dpsCount: 11,
  maxSameClass: null,
  minIlvl: null,
  onlyMains: false,
  classRequirements: [],
};

function templateKey(raidKey: string, difficulty: Difficulty): string {
  return `${raidKey}|${difficulty}`;
}

export async function getRaidRunTemplates(
  supabase: SupabaseClient
): Promise<Map<string, RaidRunTemplateConfig>> {
  const [{ data: templateRows }, { data: requirementRows }] = await Promise.all([
    supabase
      .from("raid_run_templates")
      .select(
        "raid_key, difficulty, tank_count, heal_count, dps_count, max_same_class, min_ilvl, only_mains"
      ),
    supabase
      .from("raid_run_class_requirements")
      .select("raid_key, difficulty, class, spec, min_count, max_count"),
  ]);

  const result = new Map<string, RaidRunTemplateConfig>();
  for (const row of templateRows ?? []) {
    result.set(templateKey(row.raid_key as string, row.difficulty as Difficulty), {
      tankCount: row.tank_count as number,
      healCount: row.heal_count as number,
      dpsCount: row.dps_count as number,
      maxSameClass: (row.max_same_class as number | null) ?? null,
      minIlvl: (row.min_ilvl as number | null) ?? null,
      onlyMains: (row.only_mains as boolean | null) ?? false,
      classRequirements: [],
    });
  }
  for (const row of requirementRows ?? []) {
    const key = templateKey(row.raid_key as string, row.difficulty as Difficulty);
    const template = result.get(key);
    if (!template) continue;
    template.classRequirements.push({
      class: row.class as string,
      min: row.min_count as number,
      max: (row.max_count as number | null) ?? null,
      spec: (row.spec as string | null) ?? null,
    });
  }
  return result;
}

export function templateForRaid(
  templates: Map<string, RaidRunTemplateConfig>,
  raidKey: string,
  difficulty: Difficulty
): RaidRunTemplateConfig {
  return templates.get(templateKey(raidKey, difficulty)) ?? DEFAULT_RAID_RUN_TEMPLATE;
}

export async function saveRaidRunTemplate(
  supabase: SupabaseClient,
  raidKey: string,
  difficulty: Difficulty,
  config: RaidRunTemplateConfig
): Promise<string | null> {
  const { error: upsertError } = await supabase.from("raid_run_templates").upsert(
    {
      raid_key: raidKey,
      difficulty,
      tank_count: config.tankCount,
      heal_count: config.healCount,
      dps_count: config.dpsCount,
      max_same_class: config.maxSameClass,
      min_ilvl: config.minIlvl,
      only_mains: config.onlyMains,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "raid_key,difficulty" }
  );
  if (upsertError) return upsertError.message;

  const { error: deleteError } = await supabase
    .from("raid_run_class_requirements")
    .delete()
    .eq("raid_key", raidKey)
    .eq("difficulty", difficulty);
  if (deleteError) return deleteError.message;

  if (config.classRequirements.length > 0) {
    const { error: insertError } = await supabase.from("raid_run_class_requirements").insert(
      config.classRequirements.map((r) => ({
        raid_key: raidKey,
        difficulty,
        class: r.class,
        spec: r.spec ?? null,
        min_count: r.min,
        max_count: r.max,
      }))
    );
    if (insertError) return insertError.message;
  }

  return null;
}
