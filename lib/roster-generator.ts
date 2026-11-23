import type { CharacterTier } from "@/lib/roster-tiers";

export type { CharacterTier };

export interface RoleRequest {
  role: "tank" | "heal" | "dps";
  count: number;
  minIlvl: number;
}

export interface ClassRequirement {
  class: string;
  min: number;
  max: number | null;
  spec?: string | null;
}

export interface RoleClassRequirement {
  role: string;
  class: string;
  count: number;
}

export interface Candidate {
  id: string;
  user_id: string;
  name: string;
  realm_slug: string;
  region: string;
  ilvl: number;
  class: string | null;
  active_spec: string | null;
  role: string;
  discord_username: string;
  isOffSpec: boolean;
  specUsed: string | null;
  hasMochila: boolean;
  mochilaCount: number;
  isMainClass: boolean;
  ownerMainClasses: string[];
  tier: CharacterTier;
  isDayOff: boolean;
}

export interface RosterSelection {
  role: string;
  candidate: Candidate;
  isSaved: boolean | null;
}

interface AutoCandidate extends Candidate {
  isSaved: boolean | null;
}

interface AutoUserSuggestion {
  user_id: string;
  discord_username: string;
  characters: AutoCandidate[];
}

export interface AutoGenerateInput {
  roles: RoleRequest[];
  suggestions: Record<string, AutoUserSuggestion[]>;
  classRequirements?: ClassRequirement[];
  requiredRoleClasses?: RoleClassRequirement[];
  savedCap?: number | null;
  unsavedCap?: number | null;
  targetAvgIlvl?: number | null;
  maxSameClass?: number;
  mochilasNeeded?: number;
  seed?: number;
}

export interface RosterDiagnostics {
  unfilledSlots: { role: string; count: number }[];
  unmetClassMins: { class: string; needed: number; got: number }[];
  exceededClassMaxes: { class: string; max: number; got: number }[];
  lastResortUsed: { characterName: string; discordUsername: string; reason: string }[];
  offMainClassUsed: {
    discordUsername: string;
    mainClasses: string[];
    playedClass: string;
    reason: string;
  }[];
  charactersWithoutClass: number;
  capViolations: { type: "saved" | "unsaved"; over: number }[];
  scoreVector: { name: string; value: number }[];
}

export interface RosterGenerationResult {
  picks: RosterSelection[];
  diagnostics: RosterDiagnostics;
}

export const DEFAULT_MAX_SAME_CLASS = 4;

export const ILVL_VARIETY_TOLERANCE_RATIO = 0.97;

const DIVERSITY_ROLES = new Set(["tank", "heal"]);

const CRITERIA = [
  "unfilledSlots",
  "capViolations",
  "requiredRoleClassMissing",
  "classMinMissing",
  "classMaxExcess",
  "lastResort",
  "offMainClass",
  "offSpec",
  "classCrowding",
  "belowMinIlvl",
  "mochilasMissing",
  "preferredUsed",
  "ilvlDeviation",
  "mochilaRotation",
] as const;

type CriterionName = (typeof CRITERIA)[number];
type ScoreVector = number[];

const IDX = Object.fromEntries(CRITERIA.map((name, i) => [name, i])) as Record<
  CriterionName,
  number
>;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function defaultSeed(): number {
  return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function pickRandom<T>(arr: T[], rng: () => number): T | undefined {
  if (arr.length === 0) return undefined;
  return arr[Math.floor(rng() * arr.length)];
}

function isEligible(
  c: AutoCandidate,
  savedCap: number | null,
  unsavedCap: number | null,
  savedUsed: number,
  unsavedUsed: number
): boolean {
  if (c.isDayOff) return false;
  if (c.tier === "excluido") return false;
  if (c.isSaved === true && savedCap !== null && savedUsed >= savedCap) return false;
  if (c.isSaved === false && unsavedCap !== null && unsavedUsed >= unsavedCap) return false;
  return true;
}

interface RosterState {
  filledByRole: Map<string, number>;
  countByClass: Map<string, number>;
  countByClassSpec: Map<string, number>;
  countByRoleClass: Map<string, number>;
  saved: number;
  unsaved: number;
  lastResort: number;
  preferred: number;
  offMain: number;
  offSpec: number;
  belowMinIlvl: number;
  belowVarietyBand: number;
  diversityDups: number;
  crowdingExcess: number;
  mochilaUsers: number;
  mochilaRotation: number;
  ilvlSum: number;
  picks: number;
}

function emptyState(): RosterState {
  return {
    filledByRole: new Map(),
    countByClass: new Map(),
    countByClassSpec: new Map(),
    countByRoleClass: new Map(),
    saved: 0,
    unsaved: 0,
    lastResort: 0,
    preferred: 0,
    offMain: 0,
    offSpec: 0,
    belowMinIlvl: 0,
    belowVarietyBand: 0,
    diversityDups: 0,
    crowdingExcess: 0,
    mochilaUsers: 0,
    mochilaRotation: 0,
    ilvlSum: 0,
    picks: 0,
  };
}

function bump(map: Map<string, number>, key: string, delta: number): number {
  const next = (map.get(key) ?? 0) + delta;
  if (next === 0) map.delete(key);
  else map.set(key, next);
  return next;
}

interface CrowdingLimits {
  byClass: Map<string, number>;
  fallback: number;
}

function buildCrowdingLimits(input: AutoGenerateInput): CrowdingLimits {
  const fallback = input.maxSameClass ?? DEFAULT_MAX_SAME_CLASS;
  const byClass = new Map<string, number>();
  for (const req of input.classRequirements ?? []) {
    byClass.set(req.class, req.max != null ? Infinity : Math.max(fallback, req.min));
  }
  return { byClass, fallback };
}

function applyPick(state: RosterState, pick: RosterSelection, ctx: EngineContext, sign: 1 | -1): void {
  const c = pick.candidate;

  bump(state.filledByRole, pick.role, sign);
  state.picks += sign;
  state.ilvlSum += c.ilvl * sign;

  if (pick.isSaved === true) state.saved += sign;
  if (pick.isSaved === false) state.unsaved += sign;

  if (c.tier === "ultimo_recurso") state.lastResort += sign;
  if (c.tier === "preferido") state.preferred += sign;
  if (!c.isMainClass) state.offMain += sign;
  if (c.isOffSpec) state.offSpec += sign;
  if (c.ilvl < (ctx.minIlvlByRole.get(pick.role) ?? 0)) state.belowMinIlvl += sign;
  const varietyFloor = (ctx.maxIlvlByRole.get(pick.role) ?? 0) * ILVL_VARIETY_TOLERANCE_RATIO;
  if (c.ilvl < varietyFloor) state.belowVarietyBand += sign;
  if (c.hasMochila) {
    state.mochilaUsers += sign;
    state.mochilaRotation += c.mochilaCount * sign;
  }

  if (c.class) {
    const after = bump(state.countByClass, c.class, sign);
    const limit = ctx.crowdingLimits.byClass.get(c.class) ?? ctx.crowdingLimits.fallback;
    if (sign === 1 ? after > limit : after >= limit) state.crowdingExcess += sign;

    if (c.specUsed) bump(state.countByClassSpec, `${c.class}|${c.specUsed}`, sign);

    const roleKey = `${pick.role}|${c.class}`;
    const roleAfter = bump(state.countByRoleClass, roleKey, sign);
    if (DIVERSITY_ROLES.has(pick.role)) {
      if (sign === 1 ? roleAfter > 1 : roleAfter >= 1) state.diversityDups += sign;
    }
  }
}

function buildVector(state: RosterState, input: AutoGenerateInput): ScoreVector {
  const v = new Array(CRITERIA.length).fill(0);

  for (const roleReq of input.roles) {
    const filled = Math.min(state.filledByRole.get(roleReq.role) ?? 0, roleReq.count);
    v[IDX.unfilledSlots] += roleReq.count - filled;
  }

  if (input.savedCap != null) v[IDX.capViolations] += Math.max(0, state.saved - input.savedCap);
  if (input.unsavedCap != null) {
    v[IDX.capViolations] += Math.max(0, state.unsaved - input.unsavedCap);
  }

  for (const req of input.requiredRoleClasses ?? []) {
    const have = state.countByRoleClass.get(`${req.role}|${req.class}`) ?? 0;
    v[IDX.requiredRoleClassMissing] += Math.max(0, req.count - have);
  }

  for (const req of input.classRequirements ?? []) {
    const have = req.spec
      ? state.countByClassSpec.get(`${req.class}|${req.spec}`) ?? 0
      : state.countByClass.get(req.class) ?? 0;
    v[IDX.classMinMissing] += Math.max(0, req.min - have);
    if (req.max != null) v[IDX.classMaxExcess] += Math.max(0, have - req.max);
  }

  v[IDX.lastResort] = state.lastResort;
  v[IDX.offMainClass] = state.offMain;
  v[IDX.offSpec] = state.offSpec;
  v[IDX.classCrowding] = state.diversityDups + state.crowdingExcess;
  v[IDX.belowMinIlvl] = state.belowMinIlvl;

  if (input.mochilasNeeded) {
    v[IDX.mochilasMissing] = Math.max(0, input.mochilasNeeded - state.mochilaUsers);
  }

  v[IDX.preferredUsed] = -state.preferred;

  if (input.targetAvgIlvl) {
    if (state.picks > 0) {
      const avg = state.ilvlSum / state.picks;
      v[IDX.ilvlDeviation] = Math.max(0, input.targetAvgIlvl - avg);
    }
  } else {
    v[IDX.ilvlDeviation] = state.belowVarietyBand;
  }

  v[IDX.mochilaRotation] = state.mochilaRotation;

  return v;
}

function compareVectors(a: ScoreVector, b: ScoreVector): number {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

function decidingCriterion(better: ScoreVector, worse: ScoreVector): CriterionName | null {
  for (let i = 0; i < better.length; i++) {
    if (better[i] !== worse[i]) return CRITERIA[i];
  }
  return null;
}

const CRITERION_LABELS: Record<CriterionName, string> = {
  unfilledSlots: "habría dejado un cupo de rol vacío",
  capViolations: "se habría pasado del cupo de saved/unsaved",
  requiredRoleClassMissing: "habría incumplido una clase obligatoria del contenido",
  classMinMissing: "habría dejado sin cubrir una clase pedida",
  classMaxExcess: "se habría pasado del máximo de una clase",
  lastResort: "la alternativa también era de último recurso",
  offMainClass: "no le quedaban personajes elegibles de su clase main",
  offSpec: "la alternativa obligaba a usar una Off-Spec",
  classCrowding: "habría repetido clase de más",
  belowMinIlvl: "la alternativa quedaba por debajo del ilvl mínimo",
  mochilasMissing: "habría dejado al roster sin suficientes mochilas",
  preferredUsed: "la alternativa no era un personaje preferido",
  ilvlDeviation: "la alternativa quedaba por debajo del ilvl objetivo, o fuera de la banda competente",
  mochilaRotation: "desempate por rotación de mochila",
};

function pickCharacterForUser(
  characters: AutoCandidate[],
  savedCap: number | null,
  unsavedCap: number | null,
  savedUsed: number,
  unsavedUsed: number,
  requestedClasses: Set<string>,
  rng: () => number
): AutoCandidate | undefined {
  const eligible = characters.filter((c) =>
    isEligible(c, savedCap, unsavedCap, savedUsed, unsavedUsed)
  );
  if (eligible.length === 0) return undefined;

  const normal = eligible.filter((c) => c.tier !== "ultimo_recurso");
  const tierPool = normal.length > 0 ? normal : eligible;

  const mainMatches = tierPool.filter((c) => !c.isOffSpec);
  const specPool = mainMatches.length > 0 ? mainMatches : tierPool;

  const priority = specPool.filter(
    (c) => c.isMainClass || (c.class && requestedClasses.has(c.class))
  );
  return pickRandom(priority.length > 0 ? priority : specPool, rng);
}

function countSavedUnsaved(picks: RosterSelection[]): { saved: number; unsaved: number } {
  let saved = 0;
  let unsaved = 0;
  for (const p of picks) {
    if (p.isSaved === true) saved++;
    if (p.isSaved === false) unsaved++;
  }
  return { saved, unsaved };
}

function runOneAttempt(input: AutoGenerateInput, rng: () => number): RosterSelection[] {
  const usedUserIds = new Set<string>();
  let savedUsed = 0;
  let unsavedUsed = 0;
  const savedCap = input.savedCap ?? null;
  const unsavedCap = input.unsavedCap ?? null;
  const requestedClasses = new Set([
    ...(input.classRequirements ?? []).map((r) => r.class),
    ...(input.requiredRoleClasses ?? []).map((r) => r.class),
  ]);
  const picks: RosterSelection[] = [];

  const rolesByScarcity = [...input.roles].sort((a, b) => {
    const poolA = (input.suggestions[a.role] ?? []).length / Math.max(1, a.count);
    const poolB = (input.suggestions[b.role] ?? []).length / Math.max(1, b.count);
    return poolA - poolB;
  });

  for (const roleReq of rolesByScarcity) {
    const pool = shuffle(input.suggestions[roleReq.role] ?? [], rng);
    const mainPool = pool.filter((u) => u.characters.some((c) => !c.isOffSpec));
    const offSpecOnlyPool = pool.filter((u) => u.characters.every((c) => c.isOffSpec));
    let filled = 0;
    for (const user of [...mainPool, ...offSpecOnlyPool]) {
      if (filled >= roleReq.count) break;
      if (usedUserIds.has(user.user_id)) continue;

      const character = pickCharacterForUser(
        user.characters,
        savedCap,
        unsavedCap,
        savedUsed,
        unsavedUsed,
        requestedClasses,
        rng
      );
      if (!character) continue;

      usedUserIds.add(user.user_id);
      if (character.isSaved === true) savedUsed++;
      if (character.isSaved === false) unsavedUsed++;
      picks.push({ role: roleReq.role, candidate: character, isSaved: character.isSaved });
      filled++;
    }
  }

  return picks;
}

function expandSlots(roles: RoleRequest[]): string[] {
  return roles.flatMap((r) => Array.from({ length: r.count }, () => r.role));
}

function alignToSlots(slots: string[], picks: RosterSelection[]): (RosterSelection | null)[] {
  const remaining = picks.slice();
  return slots.map((role) => {
    const idx = remaining.findIndex((p) => p.role === role);
    if (idx === -1) return null;
    return remaining.splice(idx, 1)[0];
  });
}

function materialize(assigned: (RosterSelection | null)[]): RosterSelection[] {
  return assigned.filter((s): s is RosterSelection => s !== null);
}

const REFINE_MAX_PASSES = 40;

function bestCharacterFor(
  user: AutoUserSuggestion,
  role: string,
  savedCap: number | null,
  unsavedCap: number | null,
  savedUsed: number,
  unsavedUsed: number
): RosterSelection | null {
  let best: RosterSelection | null = null;
  let bestRank = -Infinity;
  for (const c of user.characters) {
    if (!isEligible(c, savedCap, unsavedCap, savedUsed, unsavedUsed)) continue;
    const rank = (c.isOffSpec ? 0 : 1_000_000) + (c.isMainClass ? 500_000 : 0) + c.ilvl;
    if (rank > bestRank) {
      bestRank = rank;
      best = { role, candidate: c, isSaved: c.isSaved };
    }
  }
  return best;
}

interface EngineContext {
  input: AutoGenerateInput;
  minIlvlByRole: Map<string, number>;
  maxIlvlByRole: Map<string, number>;
  crowdingLimits: CrowdingLimits;
  classReqByClass: Map<string, ClassRequirement>;
  roleClassReq: Map<string, RoleClassRequirement>;
  countByRole: Map<string, number>;
}

function buildContext(input: AutoGenerateInput): EngineContext {
  const maxIlvlByRole = new Map<string, number>();
  for (const [role, users] of Object.entries(input.suggestions)) {
    let max = 0;
    for (const u of users) for (const c of u.characters) max = Math.max(max, c.ilvl);
    maxIlvlByRole.set(role, max);
  }

  return {
    input,
    minIlvlByRole: new Map(input.roles.map((r) => [r.role, r.minIlvl])),
    maxIlvlByRole,
    crowdingLimits: buildCrowdingLimits(input),
    classReqByClass: new Map((input.classRequirements ?? []).map((r) => [r.class, r])),
    roleClassReq: new Map((input.requiredRoleClasses ?? []).map((r) => [`${r.role}|${r.class}`, r])),
    countByRole: new Map(input.roles.map((r) => [r.role, r.count])),
  };
}

function vectorWithCandidate(
  base: ScoreVector,
  state: RosterState,
  pick: RosterSelection,
  ctx: EngineContext
): ScoreVector {
  const v = base.slice();
  const c = pick.candidate;
  const input = ctx.input;

  if ((state.filledByRole.get(pick.role) ?? 0) < (ctx.countByRole.get(pick.role) ?? 0)) {
    v[IDX.unfilledSlots] -= 1;
  }

  if (pick.isSaved === true && input.savedCap != null && state.saved >= input.savedCap) {
    v[IDX.capViolations] += 1;
  }
  if (pick.isSaved === false && input.unsavedCap != null && state.unsaved >= input.unsavedCap) {
    v[IDX.capViolations] += 1;
  }

  if (c.class) {
    const roleClassKey = `${pick.role}|${c.class}`;
    const roleReq = ctx.roleClassReq.get(roleClassKey);
    if (roleReq && (state.countByRoleClass.get(roleClassKey) ?? 0) < roleReq.count) {
      v[IDX.requiredRoleClassMissing] -= 1;
    }

    const classReq = ctx.classReqByClass.get(c.class);
    if (classReq) {
      const counts = classReq.spec
        ? c.specUsed === classReq.spec
        : true;
      if (counts) {
        const have = classReq.spec
          ? state.countByClassSpec.get(`${c.class}|${classReq.spec}`) ?? 0
          : state.countByClass.get(c.class) ?? 0;
        if (have < classReq.min) v[IDX.classMinMissing] -= 1;
        if (classReq.max != null && have >= classReq.max) v[IDX.classMaxExcess] += 1;
      }
    }

    const limit = ctx.crowdingLimits.byClass.get(c.class) ?? ctx.crowdingLimits.fallback;
    if ((state.countByClass.get(c.class) ?? 0) + 1 > limit) v[IDX.classCrowding] += 1;
    if (DIVERSITY_ROLES.has(pick.role) && (state.countByRoleClass.get(roleClassKey) ?? 0) >= 1) {
      v[IDX.classCrowding] += 1;
    }
  }

  if (c.tier === "ultimo_recurso") v[IDX.lastResort] += 1;
  if (c.tier === "preferido") v[IDX.preferredUsed] -= 1;
  if (!c.isMainClass) v[IDX.offMainClass] += 1;
  if (c.isOffSpec) v[IDX.offSpec] += 1;
  if (c.ilvl < (ctx.minIlvlByRole.get(pick.role) ?? 0)) v[IDX.belowMinIlvl] += 1;
  const varietyFloor = (ctx.maxIlvlByRole.get(pick.role) ?? 0) * ILVL_VARIETY_TOLERANCE_RATIO;
  if (c.ilvl < varietyFloor) v[IDX.ilvlDeviation] += 1;

  if (c.hasMochila) {
    if (input.mochilasNeeded && state.mochilaUsers < input.mochilasNeeded) {
      v[IDX.mochilasMissing] -= 1;
    }
    v[IDX.mochilaRotation] += c.mochilaCount;
  }

  if (input.targetAvgIlvl) {
    const avg = (state.ilvlSum + c.ilvl) / (state.picks + 1);
    v[IDX.ilvlDeviation] = Math.max(0, input.targetAvgIlvl - avg);
  }

  return v;
}

function stateFor(picks: RosterSelection[], ctx: EngineContext): RosterState {
  const state = emptyState();
  for (const p of picks) {
    applyPick(state, p, ctx, 1);
  }
  return state;
}

function addPick(state: RosterState, pick: RosterSelection, ctx: EngineContext): void {
  applyPick(state, pick, ctx, 1);
}

function removePick(state: RosterState, pick: RosterSelection, ctx: EngineContext): void {
  applyPick(state, pick, ctx, -1);
}

function vectorFor(picks: RosterSelection[], ctx: EngineContext): ScoreVector {
  return buildVector(stateFor(picks, ctx), ctx.input);
}

function refineSelection(
  initialPicks: RosterSelection[],
  ctx: EngineContext
): RosterSelection[] {
  const input = ctx.input;
  const slots = expandSlots(input.roles);
  const assigned = alignToSlots(slots, initialPicks);
  const savedCap = input.savedCap ?? null;
  const unsavedCap = input.unsavedCap ?? null;

  let state = stateFor(materialize(assigned), ctx);
  let currentVector = buildVector(state, input);

  const usersByRole = new Map<string, AutoUserSuggestion[]>();
  for (const role of new Set(slots)) usersByRole.set(role, input.suggestions[role] ?? []);

  for (let pass = 0; pass < REFINE_MAX_PASSES; pass++) {
    let improved = false;

    if (assigned.includes(null)) {
      const before = assigned.slice();
      if (fillEmptySlotsByReassignment(assigned, slots, usersByRole, savedCap, unsavedCap)) {
        const nextPicks = materialize(assigned);
        const nextVector = vectorFor(nextPicks, ctx);
        if (compareVectors(nextVector, currentVector) < 0) {
          state = stateFor(nextPicks, ctx);
          currentVector = nextVector;
          improved = true;
        } else {
          for (let k = 0; k < assigned.length; k++) assigned[k] = before[k];
        }
      }
    }

    for (let i = 0; i < slots.length; i++) {
      const role = slots[i];
      const current = assigned[i];

      const usedByOthers = new Set<string>();
      for (let k = 0; k < assigned.length; k++) {
        if (k === i) continue;
        const p = assigned[k];
        if (p) usedByOthers.add(p.candidate.user_id);
      }

      if (current) removePick(state, current, ctx);
      const withoutVector = buildVector(state, input);
      const savedWithout = state.saved;
      const unsavedWithout = state.unsaved;

      let bestPick: RosterSelection | null = current;
      let bestVector = current ? currentVector : withoutVector;

      for (const user of usersByRole.get(role) ?? []) {
        if (usedByOthers.has(user.user_id)) continue;
        for (const character of user.characters) {
          if (!isEligible(character, savedCap, unsavedCap, savedWithout, unsavedWithout)) continue;
          if (current && character.id === current.candidate.id) continue;

          const candidatePick: RosterSelection = {
            role,
            candidate: character,
            isSaved: character.isSaved,
          };
          const vector = vectorWithCandidate(withoutVector, state, candidatePick, ctx);

          if (compareVectors(vector, bestVector) < 0) {
            bestVector = vector;
            bestPick = candidatePick;
          }
        }
      }

      if (bestPick) addPick(state, bestPick, ctx);
      if (bestPick !== current) improved = true;
      assigned[i] = bestPick;
      currentVector = bestVector;
    }

    for (let i = 0; i < slots.length; i++) {
      for (let j = i + 1; j < slots.length; j++) {
        if (slots[i] === slots[j]) continue;
        const a = assigned[i];
        const b = assigned[j];
        if (!a && !b) continue;

        const swapped = trySwap(assigned, i, j, slots, ctx, usersByRole, savedCap, unsavedCap);
        if (swapped && compareVectors(swapped.vector, currentVector) < 0) {
          if (a) removePick(state, a, ctx);
          if (b) removePick(state, b, ctx);
          if (swapped.a) addPick(state, swapped.a, ctx);
          if (swapped.b) addPick(state, swapped.b, ctx);
          assigned[i] = swapped.a;
          assigned[j] = swapped.b;
          currentVector = swapped.vector;
          improved = true;
        }
      }
    }

    if (!improved) break;
  }

  return materialize(assigned);
}

function trySwap(
  assigned: (RosterSelection | null)[],
  i: number,
  j: number,
  slots: string[],
  ctx: EngineContext,
  usersByRole: Map<string, AutoUserSuggestion[]>,
  savedCap: number | null,
  unsavedCap: number | null
): { a: RosterSelection | null; b: RosterSelection | null; vector: ScoreVector } | null {
  const roleI = slots[i];
  const roleJ = slots[j];
  const userI = assigned[i]?.candidate.user_id ?? null;
  const userJ = assigned[j]?.candidate.user_id ?? null;

  const others = assigned
    .filter((_, idx) => idx !== i && idx !== j)
    .filter((s): s is RosterSelection => s !== null);
  const { saved, unsaved } = countSavedUnsaved(others);

  const pickFor = (userId: string | null, role: string): RosterSelection | null => {
    if (!userId) return null;
    const user = (usersByRole.get(role) ?? []).find((u) => u.user_id === userId);
    if (!user) return null;
    return bestCharacterFor(user, role, savedCap, unsavedCap, saved, unsaved);
  };

  const newA = pickFor(userJ, roleI);
  const newB = pickFor(userI, roleJ);
  if (!newA && !newB) return null;

  const candidate = others.concat([newA, newB].filter((p): p is RosterSelection => p !== null));
  const userIds = candidate.map((p) => p.candidate.user_id);
  if (new Set(userIds).size !== userIds.length) return null;

  return { a: newA, b: newB, vector: vectorFor(candidate, ctx) };
}

function fillEmptySlotsByReassignment(
  assigned: (RosterSelection | null)[],
  slots: string[],
  usersByRole: Map<string, AutoUserSuggestion[]>,
  savedCap: number | null,
  unsavedCap: number | null
): boolean {
  const { saved, unsaved } = countSavedUnsaved(materialize(assigned));

  const slotOfUser = new Map<string, number>();
  assigned.forEach((pick, idx) => {
    if (pick) slotOfUser.set(pick.candidate.user_id, idx);
  });

  let filledAny = false;

  for (let target = 0; target < slots.length; target++) {
    if (assigned[target]) continue;

    const visited = new Set<string>();

    const augment = (slotIdx: number): boolean => {
      const role = slots[slotIdx];
      for (const user of usersByRole.get(role) ?? []) {
        if (visited.has(user.user_id)) continue;
        const pick = bestCharacterFor(user, role, savedCap, unsavedCap, saved, unsaved);
        if (!pick) continue;
        visited.add(user.user_id);

        const busy = slotOfUser.get(user.user_id);
        if (busy === undefined || (busy !== slotIdx && augment(busy))) {
          assigned[slotIdx] = pick;
          slotOfUser.set(user.user_id, slotIdx);
          return true;
        }
      }
      return false;
    };

    if (augment(target)) filledAny = true;
  }

  return filledAny;
}

const AUTO_RESTARTS = 24;

function buildDiagnostics(
  picks: RosterSelection[],
  ctx: EngineContext
): RosterDiagnostics {
  const input = ctx.input;
  const state = stateFor(picks, ctx);
  const vector = buildVector(state, input);

  const unfilledSlots = input.roles
    .map((r) => ({
      role: r.role,
      count: Math.max(0, r.count - Math.min(state.filledByRole.get(r.role) ?? 0, r.count)),
    }))
    .filter((r) => r.count > 0);

  const unmetClassMins: RosterDiagnostics["unmetClassMins"] = [];
  const exceededClassMaxes: RosterDiagnostics["exceededClassMaxes"] = [];
  for (const req of input.classRequirements ?? []) {
    const got = req.spec
      ? state.countByClassSpec.get(`${req.class}|${req.spec}`) ?? 0
      : state.countByClass.get(req.class) ?? 0;
    if (got < req.min) unmetClassMins.push({ class: req.class, needed: req.min, got });
    if (req.max != null && got > req.max) {
      exceededClassMaxes.push({ class: req.class, max: req.max, got });
    }
  }

  const capViolations: RosterDiagnostics["capViolations"] = [];
  if (input.savedCap != null && state.saved > input.savedCap) {
    capViolations.push({ type: "saved", over: state.saved - input.savedCap });
  }
  if (input.unsavedCap != null && state.unsaved > input.unsavedCap) {
    capViolations.push({ type: "unsaved", over: state.unsaved - input.unsavedCap });
  }

  const usedUserIds = new Set(picks.map((p) => p.candidate.user_id));
  function reasonFor(pick: RosterSelection, wanted: (c: AutoCandidate) => boolean): string {
    const others = picks.filter((p) => p !== pick);
    let bestVector: ScoreVector | null = null;
    for (const user of input.suggestions[pick.role] ?? []) {
      if (user.user_id !== pick.candidate.user_id && usedUserIds.has(user.user_id)) continue;
      for (const c of user.characters) {
        if (c.id === pick.candidate.id) continue;
        if (!wanted(c)) continue;
        const v = vectorFor(
          others.concat([{ role: pick.role, candidate: c, isSaved: c.isSaved }]),
          ctx
        );
        if (!bestVector || compareVectors(v, bestVector) < 0) bestVector = v;
      }
    }
    if (!bestVector) return "no había ninguna alternativa elegible para ese cupo";
    const criterion = decidingCriterion(vector, bestVector);
    return criterion ? CRITERION_LABELS[criterion] : "la alternativa era equivalente";
  }

  const lastResortUsed = picks
    .filter((p) => p.candidate.tier === "ultimo_recurso")
    .map((p) => ({
      characterName: p.candidate.name,
      discordUsername: p.candidate.discord_username,
      reason: reasonFor(p, (c) => c.tier !== "ultimo_recurso" && c.tier !== "excluido"),
    }));

  const offMainClassUsed = picks
    .filter((p) => !p.candidate.isMainClass)
    .map((p) => ({
      discordUsername: p.candidate.discord_username,
      mainClasses: p.candidate.ownerMainClasses,
      playedClass: p.candidate.class ?? "sin clase",
      reason: reasonFor(p, (c) => c.isMainClass),
    }));

  return {
    unfilledSlots,
    unmetClassMins,
    exceededClassMaxes,
    lastResortUsed,
    offMainClassUsed,
    charactersWithoutClass: picks.filter((p) => !p.candidate.class).length,
    capViolations,
    scoreVector: CRITERIA.map((name, i) => ({ name, value: vector[i] })),
  };
}

export function generateAutomaticSelection(input: AutoGenerateInput): RosterGenerationResult {
  const ctx = buildContext(input);
  const rng = mulberry32(input.seed ?? defaultSeed());

  let best: RosterSelection[] = [];
  let bestVector: ScoreVector | null = null;

  for (let i = 0; i < AUTO_RESTARTS; i++) {
    const refined = refineSelection(runOneAttempt(input, rng), ctx);
    const vector = vectorFor(refined, ctx);
    if (!bestVector || compareVectors(vector, bestVector) < 0) {
      bestVector = vector;
      best = refined;
    }
  }

  return { picks: best, diagnostics: buildDiagnostics(best, ctx) };
}
