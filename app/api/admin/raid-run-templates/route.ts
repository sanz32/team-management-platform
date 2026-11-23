import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import type { Difficulty } from "@/lib/raids";
import { getCurrentRaidCatalog } from "@/lib/raid-catalog";
import type { ClassRequirement } from "@/lib/roster-generator";
import {
  DEFAULT_RAID_RUN_TEMPLATE,
  getRaidRunTemplates,
  saveRaidRunTemplate,
  templateForRaid,
  type RaidRunTemplateConfig,
} from "@/lib/raid-run-templates";

export interface RaidRunTemplateEntry extends RaidRunTemplateConfig {
  raidKey: string;
  difficulty: Difficulty;
}

function requireManager(appRole: string | undefined) {
  return appRole === "admin" || appRole === "manager";
}

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  if (!requireManager(session.user.appRole)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const supabase = createServerSupabaseClient();
  const [templates, { raids }] = await Promise.all([
    getRaidRunTemplates(supabase),
    getCurrentRaidCatalog(supabase),
  ]);

  const entries: RaidRunTemplateEntry[] = raids.flatMap((raid) =>
    raid.difficulties.map((difficulty) => ({
      raidKey: raid.key,
      difficulty,
      ...templateForRaid(templates, raid.key, difficulty),
    }))
  );

  return NextResponse.json({ entries });
}

interface ClassRequirementInput {
  class?: string;
  min?: number;
  max?: number | null;
  spec?: string | null;
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  if (!requireManager(session.user.appRole)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const {
    raidKey,
    difficulty,
    tankCount,
    healCount,
    dpsCount,
    maxSameClass,
    minIlvl,
    onlyMains,
    classRequirements,
  } = body as {
    raidKey?: string;
    difficulty?: Difficulty;
    tankCount?: number;
    healCount?: number;
    dpsCount?: number;
    maxSameClass?: number | null;
    minIlvl?: number | null;
    onlyMains?: boolean;
    classRequirements?: ClassRequirementInput[];
  };

  const supabase = createServerSupabaseClient();
  const { raids } = await getCurrentRaidCatalog(supabase);
  const raid = raids.find((r) => r.key === raidKey);
  if (!raid) {
    return NextResponse.json({ error: "Raid inválida" }, { status: 400 });
  }
  if (!difficulty || !raid.difficulties.includes(difficulty)) {
    return NextResponse.json(
      { error: `${raid.name} no tiene dificultad ${difficulty ?? ""}` },
      { status: 400 }
    );
  }

  const counts = [tankCount, healCount, dpsCount];
  if (counts.some((c) => typeof c !== "number" || !Number.isInteger(c) || c < 0)) {
    return NextResponse.json(
      { error: "Tank/Heal/DPS deben ser números enteros mayores o iguales a 0" },
      { status: 400 }
    );
  }
  if ((tankCount ?? 0) + (healCount ?? 0) + (dpsCount ?? 0) === 0) {
    return NextResponse.json({ error: "La composición no puede estar vacía" }, { status: 400 });
  }
  if (
    maxSameClass !== undefined &&
    maxSameClass !== null &&
    (!Number.isInteger(maxSameClass) || maxSameClass < 1)
  ) {
    return NextResponse.json(
      { error: "El tope de clases repetidas debe ser un entero mayor a 0 (o vacío)" },
      { status: 400 }
    );
  }
  if (minIlvl !== undefined && minIlvl !== null && (!Number.isInteger(minIlvl) || minIlvl < 0)) {
    return NextResponse.json(
      { error: "El ilvl mínimo debe ser un entero mayor o igual a 0 (o vacío)" },
      { status: 400 }
    );
  }

  const requirements: ClassRequirement[] = [];
  for (const req of classRequirements ?? []) {
    if (!req.class?.trim()) {
      return NextResponse.json({ error: "Cada requisito necesita una clase" }, { status: 400 });
    }
    const min = req.min ?? 0;
    if (!Number.isInteger(min) || min < 0) {
      return NextResponse.json(
        { error: `El mínimo de ${req.class} debe ser un entero mayor o igual a 0` },
        { status: 400 }
      );
    }
    if (req.max != null && (!Number.isInteger(req.max) || req.max < min)) {
      return NextResponse.json(
        { error: `El máximo de ${req.class} no puede ser menor que el mínimo` },
        { status: 400 }
      );
    }
    requirements.push({ class: req.class.trim(), min, max: req.max ?? null, spec: req.spec ?? null });
  }

  const config: RaidRunTemplateConfig = {
    tankCount: tankCount ?? DEFAULT_RAID_RUN_TEMPLATE.tankCount,
    healCount: healCount ?? DEFAULT_RAID_RUN_TEMPLATE.healCount,
    dpsCount: dpsCount ?? DEFAULT_RAID_RUN_TEMPLATE.dpsCount,
    maxSameClass: maxSameClass ?? null,
    minIlvl: minIlvl ?? null,
    onlyMains: onlyMains === true,
    classRequirements: requirements,
  };

  const error = await saveRaidRunTemplate(supabase, raid.key, difficulty, config);
  if (error) return NextResponse.json({ error }, { status: 500 });

  const entry: RaidRunTemplateEntry = { raidKey: raid.key, difficulty, ...config };
  return NextResponse.json({ template: entry });
}
