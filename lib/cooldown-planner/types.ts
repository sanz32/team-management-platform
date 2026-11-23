export type CooldownCategory =
  | "raid_cd"
  | "external"
  | "personal_defensive"
  | "utility"
  | "offensive";

export const CATEGORY_LABELS: Record<CooldownCategory, string> = {
  raid_cd: "Raid CD",
  external: "External",
  personal_defensive: "Defensivo personal",
  utility: "Utility",
  offensive: "Ofensivo",
};

export const CATEGORY_ORDER = Object.keys(CATEGORY_LABELS) as CooldownCategory[];

export type CooldownSpellSource = "talent_api" | "simc_dump" | "manual" | "log_import";

export interface CooldownSpell {
  spellId: number;
  name: string;
  iconUrl: string | null;
  class: string;
  spec: string | null;
  category: CooldownCategory | null;
  durationSeconds: number | null;
  isActive: boolean;
  isCategorized: boolean;
  source: CooldownSpellSource;
}

export interface ReferencePhaseTransition {
  ms: number;
  isIntermission: boolean;
}

export interface ReferenceLogImport {
  id: string;
  wclReportCode: string;
  wclFightId: number;
  bossId: string;
  difficulty: string | null;
  sourceGuildName: string | null;
  importedBy: string | null;
  importedAt: string;
  pullDurationMs: number | null;
  phaseTransitions: ReferencePhaseTransition[];
}

export interface ReferenceBossEvent {
  id: string;
  referenceLogId: string;
  spellId: number;
  spellName: string;
  timestampMs: number;
  iconUrl: string | null;
}

export interface ReferenceCooldownCast {
  id: string;
  referenceLogId: string;
  spellId: number;
  casterName: string;
  casterClass: string | null;
  casterSpec: string | null;
  timestampMs: number;
}

export interface ReferenceLogTimeline {
  log: ReferenceLogImport;
  bossEvents: ReferenceBossEvent[];
  casts: ReferenceCooldownCast[];
}

export type CooldownAssignmentSource = "manual" | "imported_from_reference";

export interface CooldownPlan {
  id: string;
  bossId: string;
  name: string;
  createdBy: string | null;
  basedOnReferenceLogId: string | null;
  updatedAt: string;
}

export interface CooldownPlanAssignment {
  id: string;
  planId: string;
  spellId: number;
  assignedCharacterId: string | null;
  plannedTimestampMs: number;
  source: CooldownAssignmentSource;
  referenceCastId: string | null;
}
