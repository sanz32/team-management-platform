import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  RoleRequest,
  ClassRequirement,
  RoleClassRequirement,
  generateAutomaticSelection,
} from "@/lib/roster-generator";
import { buildBaseCandidatePool, groupCandidatesByRole } from "@/lib/roster-candidates";
import { getCurrentLockoutWeek } from "@/lib/wow-reset";
import type { Difficulty } from "@/lib/raids";
import { getCurrentRaidCatalog } from "@/lib/raid-catalog";
import { fetchAllBossKills } from "@/lib/boss-kills";
import { computeRosterFeasibility } from "@/lib/roster-feasibility";
import { requiresVoidspireMythicMonkHeal } from "@/lib/roster-rules";

interface ContentConfig {
  raidKeys: string[];
  difficulty: Difficulty;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const appRole = session.user.appRole;
  if (appRole !== "admin" && appRole !== "manager" && appRole !== "guest") {
    return NextResponse.json(
      { error: "Solo el líder, los managers o un invitado pueden generar un roster" },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const {
    roles,
    content,
    scheduledFor,
    scheduledDate,
    mode,
    classRequirements,
    savedCount,
    unsavedCount,
    targetAvgIlvl,
    mochilasNeeded,
    excludedUserIds,
  } = body as {
    roles?: RoleRequest[];
    content?: ContentConfig | null;
    scheduledFor?: string;
    scheduledDate?: string;
    mode?: "manual" | "auto";
    classRequirements?: ClassRequirement[];
    savedCount?: number;
    unsavedCount?: number;
    targetAvgIlvl?: number | null;
    mochilasNeeded?: number;
    excludedUserIds?: string[];
  };

  if (!roles?.length || roles.some((r) => !r.role || !r.count || r.count <= 0 || r.minIlvl < 0)) {
    return NextResponse.json(
      { error: "Configura al menos un rol con cantidad e ilvl mínimo válidos" },
      { status: 400 }
    );
  }

  const supabase = createServerSupabaseClient();
  const { raids } = await getCurrentRaidCatalog(supabase);

  if (content) {
    if (!content.raidKeys?.length) {
      return NextResponse.json({ error: "Elige al menos una raid" }, { status: 400 });
    }
    for (const rk of content.raidKeys) {
      const raidDef = raids.find((r) => r.key === rk);
      if (!raidDef) {
        return NextResponse.json({ error: "Raid inválida" }, { status: 400 });
      }
      if (!raidDef.difficulties.includes(content.difficulty)) {
        return NextResponse.json(
          { error: `${raidDef.name} no tiene dificultad ${content.difficulty}` },
          { status: 400 }
        );
      }
    }
  }

  const {
    characters: eligibleCharacters,
    mainClassesByUser,
    error,
  } = await buildBaseCandidatePool(supabase, {
    excludeUserIds: new Set(excludedUserIds ?? []),
    overlapRaidKeys: content?.raidKeys ?? [],
  });

  if (error) return NextResponse.json({ error }, { status: 500 });

  let unavailableUserIds = new Set<string>();
  const rosterDate = typeof scheduledDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(scheduledDate)
    ? scheduledDate
    : scheduledFor && !Number.isNaN(new Date(scheduledFor).getTime())
      ? new Date(scheduledFor).toISOString().slice(0, 10)
      : null;
  if (rosterDate) {
    const { data: daysOff } = await supabase
      .from("availability")
      .select("user_id")
      .eq("available", false)
      .eq("date", rosterDate);
    unavailableUserIds = new Set((daysOff ?? []).map((r) => r.user_id as string));
  }

  let isSavedMap: Map<string, boolean> | null = null;

  if (content && eligibleCharacters.length > 0) {
    isSavedMap = new Map();
    const regionById = new Map(eligibleCharacters.map((c) => [c.id, c.region]));

    const orFilter = content.raidKeys
      .map((rk) => `boss_key.like.${rk}-${content.difficulty}-%`)
      .join(",");

    const kills = await fetchAllBossKills(
      supabase,
      eligibleCharacters.map((c) => c.id),
      orFilter
    );

    for (const k of kills) {
      const region = regionById.get(k.character_id);
      if (!region) continue;
      if (k.lockout_week === getCurrentLockoutWeek(region)) {
        isSavedMap.set(k.character_id, true);
      }
    }
  }

  const suggestions = groupCandidatesByRole(eligibleCharacters, mainClassesByUser, roles, (c) => ({
    isSaved: isSavedMap ? isSavedMap.get(c.id) ?? false : null,
    isDayOff: unavailableUserIds.has(c.user_id),
  }));

  const requiredRoleClasses: RoleClassRequirement[] = requiresVoidspireMythicMonkHeal(content)
    ? [{ role: "heal", class: "Monk", count: 1 }]
    : [];

  let autoResult: ReturnType<typeof generateAutomaticSelection> | undefined;
  if (mode === "auto") {
    autoResult = generateAutomaticSelection({
      roles,
      suggestions,
      classRequirements,
      requiredRoleClasses,
      savedCap: content ? savedCount ?? null : null,
      unsavedCap: content ? unsavedCount ?? null : null,
      targetAvgIlvl,
      mochilasNeeded,
    });
  }

  const feasibility = computeRosterFeasibility(roles, suggestions);

  return NextResponse.json({
    suggestions,
    autoSelected: autoResult?.picks,
    autoDiagnostics: autoResult?.diagnostics,
    feasibility,
  });
}
