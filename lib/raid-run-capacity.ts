import {
  generateAutomaticSelection,
  type AutoGenerateInput,
  type ClassRequirement,
  type RoleClassRequirement,
  type RoleRequest,
  type RosterGenerationResult,
} from "@/lib/roster-generator";

type Suggestions = AutoGenerateInput["suggestions"];
type SuggestionUser = Suggestions[string][number];

export interface RaidRunTemplate {
  roles: RoleRequest[];
  classRequirements?: ClassRequirement[];
  requiredRoleClasses?: RoleClassRequirement[];
  maxSameClass?: number;
}

export interface RaidRunCapacityResult {
  runs: number;
  limitingReason: string | null;
}

const CAPACITY_MAX_RUNS = 200;

const CAPACITY_SEED = 20260804;

const ROLE_LABELS: Record<string, string> = {
  tank: "Tank",
  heal: "Heal",
  dps: "DPS",
};

function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role;
}

const NO_CANDIDATES_REASON = "No hay candidatos disponibles para los roles pedidos";

function clonePool(suggestions: Suggestions): Suggestions {
  const next: Suggestions = {};
  for (const [role, users] of Object.entries(suggestions)) next[role] = users.slice();
  return next;
}

function withoutCharacters(pool: Suggestions, characterIds: Set<string>): Suggestions {
  const next: Suggestions = {};
  for (const [role, users] of Object.entries(pool)) {
    next[role] = users
      .map((u: SuggestionUser) => ({
        ...u,
        characters: u.characters.filter((c) => !characterIds.has(c.id)),
      }))
      .filter((u) => u.characters.length > 0);
  }
  return next;
}

function isPoolEmpty(pool: Suggestions, roles: RoleRequest[]): boolean {
  return roles.every((r) => (pool[r.role] ?? []).length === 0);
}

function isCompleteRun(result: RosterGenerationResult): boolean {
  const { diagnostics } = result;
  if (diagnostics.unfilledSlots.length > 0) return false;
  if (diagnostics.unmetClassMins.length > 0) return false;
  const missing = diagnostics.scoreVector.find((c) => c.name === "requiredRoleClassMissing");
  return (missing?.value ?? 0) === 0;
}

function describeLimit(result: RosterGenerationResult, template: RaidRunTemplate): string {
  const unfilled = result.diagnostics.unfilledSlots;
  if (unfilled.length > 0) {
    const parts = unfilled.map((u) => `${u.count} ${roleLabel(u.role)}`).join(", ");
    const verb = unfilled.length === 1 && unfilled[0].count === 1 ? "falta" : "faltan";
    return `Para una run más ${verb} ${parts} unsaved sin usar en otra run.`;
  }

  const unmet = result.diagnostics.unmetClassMins;
  if (unmet.length > 0) {
    const parts = unmet.map((u) => `${u.class} ${u.got}/${u.needed}`).join(", ");
    return `Para una run más no alcanza el mínimo de clase: ${parts}.`;
  }

  const missingRequired: string[] = [];
  for (const req of template.requiredRoleClasses ?? []) {
    const have = result.picks.filter(
      (p) => p.role === req.role && p.candidate.class === req.class
    ).length;
    const missing = req.count - have;
    if (missing <= 0) continue;
    missingRequired.push(`${req.class} ${roleLabel(req.role)}`);
  }
  if (missingRequired.length > 0) {
    const label = missingRequired.length === 1 ? "el obligatorio" : "los obligatorios";
    return `Para una run más falta ${label}: ${missingRequired.join(", ")}.`;
  }

  return "No se puede completar otra run con los personajes unsaved que quedan.";
}

export function computeRaidRunCapacity(
  template: RaidRunTemplate,
  suggestions: Suggestions
): RaidRunCapacityResult {
  let pool = clonePool(suggestions);
  let runs = 0;

  for (let i = 0; i < CAPACITY_MAX_RUNS; i++) {
    if (isPoolEmpty(pool, template.roles)) {
      return { runs, limitingReason: NO_CANDIDATES_REASON };
    }

    const result = generateAutomaticSelection({
      roles: template.roles,
      suggestions: pool,
      classRequirements: template.classRequirements,
      requiredRoleClasses: template.requiredRoleClasses,
      maxSameClass: template.maxSameClass,
      seed: CAPACITY_SEED,
    });

    if (!isCompleteRun(result)) {
      return { runs, limitingReason: describeLimit(result, template) };
    }

    runs++;
    pool = withoutCharacters(pool, new Set(result.picks.map((p) => p.candidate.id)));
  }

  return { runs, limitingReason: null };
}
