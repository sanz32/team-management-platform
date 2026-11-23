import type { BoostCategory } from "@/lib/boost";
import { zonedTimeToUtc } from "@/lib/timezone";

export interface ParsedOffer {
  category: BoostCategory;
  groupLabel: string;
  titleEn: string;
  descriptionEn: string;
  priceGold: number;
  badge: string | null;
}

export interface ParsedCatalog {
  offers: ParsedOffer[];
  warnings: string[];
}

const DIFFICULTY_BY_HEADER: Record<string, BoostCategory> = {
  "normal raids": "normal",
  "heroic raids": "heroic",
  "mythic raids": "mythic",
};

const GROUP_COUNT = /^\d+\s+services\s+available$/i;
const SECTION_COUNT = /^\d+\s+services$/i;
const PRICE_KEYWORD = /^price$/i;
const GOLD_AMOUNT = /^([\d.,\s]+)\s*gold$/i;

const BULLET = /^\s*\u{1F538}\s*/u;

function clean(line: string): string {
  return line.replace(BULLET, "").trim();
}

function parseGold(raw: string): number | null {
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return null;
  const value = Number(digits);
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

export function parseBoostCatalog(text: string): ParsedCatalog {
  const lines = text
    .split(/\r?\n/)
    .map(clean)
    .filter((l) => l.length > 0);

  const offers: ParsedOffer[] = [];
  const warnings: string[] = [];

  let group = "";
  let category: BoostCategory | null = null;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const next = lines[i + 1] ?? "";

    const asDifficulty = DIFFICULTY_BY_HEADER[line.toLowerCase()];
    if (asDifficulty && SECTION_COUNT.test(next)) {
      category = asDifficulty;
      i += 2;
      continue;
    }

    if (GROUP_COUNT.test(next)) {
      group = line;
      category = null;
      i += 2;
      continue;
    }

    const title = line;
    i += 1;

    let badge: string | null = null;
    const descriptionParts: string[] = [];
    let foundPrice = false;

    while (i < lines.length) {
      const current = lines[i];
      if (PRICE_KEYWORD.test(current)) {
        foundPrice = true;
        i += 1;
        break;
      }
      if (GROUP_COUNT.test(lines[i + 1] ?? "") || DIFFICULTY_BY_HEADER[current.toLowerCase()]) {
        break;
      }
      if (descriptionParts.length === 0 && badge === null && /^hot$/i.test(current)) {
        badge = "HOT";
      } else {
        descriptionParts.push(current);
      }
      i += 1;
    }

    if (!foundPrice) {
      warnings.push(`"${title}": no se encontró su precio, se omitió.`);
      continue;
    }

    const amountLine = lines[i] ?? "";
    const match = amountLine.match(GOLD_AMOUNT);
    const price = match ? parseGold(match[1]) : parseGold(amountLine);
    i += 1;

    if (price === null) {
      warnings.push(`"${title}": el precio "${amountLine}" no se entendió, se omitió.`);
      continue;
    }
    if (!category) {
      warnings.push(`"${title}": no está debajo de ninguna dificultad, se omitió.`);
      continue;
    }

    offers.push({
      category,
      groupLabel: group,
      titleEn: title,
      descriptionEn: descriptionParts.join(" ").trim(),
      priceGold: price,
      badge,
    });
  }

  return { offers, warnings };
}

const SCHEDULE_TIMEZONE = "America/New_York";

const OWN_TEAM = "gg";

const ROW_DATE = /^[A-Za-z]+\s+(\d{1,2})\/(\d{1,2})$/;
const ROW_TIME = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i;
const ROW_BUYERS = /^(\d+)\s*\/\s*(\d+)$/;

const DIFFICULTY_BY_NAME: Record<string, BoostCategory> = {
  normal: "normal",
  heroic: "heroic",
  mythic: "mythic",
};

export interface ParsedSlot {
  scheduledAt: string;
  difficulty: BoostCategory;
  label: string;
  capacity: number;
  bookedCount: number;
  externalId: number | null;
}

export interface ParsedSchedule {
  slots: ParsedSlot[];
  warnings: string[];
}

function to24h(raw: string): string | null {
  const m = raw.match(ROW_TIME);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour < 1 || hour > 12 || minute > 59) return null;
  const isPm = m[3].toUpperCase() === "PM";
  if (hour === 12) hour = 0;
  if (isPm) hour += 12;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function resolveYear(month: number, day: number, time: string, now: Date): Date {
  const base = now.getUTCFullYear();
  let best: Date | null = null;
  for (const year of [base - 1, base, base + 1]) {
    const dateKey = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const candidate = zonedTimeToUtc(dateKey, time, SCHEDULE_TIMEZONE);
    if (Number.isNaN(candidate.getTime())) continue;
    if (!best || Math.abs(candidate.getTime() - now.getTime()) < Math.abs(best.getTime() - now.getTime())) {
      best = candidate;
    }
  }
  return best ?? new Date(NaN);
}

export function parseBoostSchedule(text: string, now: Date = new Date()): ParsedSchedule {
  const slots: ParsedSlot[] = [];
  const warnings: string[] = [];
  const otrosEquipos = new Set<string>();

  for (const rawLine of text.split(/\r?\n/)) {
    if (!rawLine.includes("\t")) continue;
    const cells = rawLine.split("\t").map((c) => c.trim());

    const at = cells.findIndex((c) => ROW_DATE.test(c));
    if (at === -1) continue;

    const dateCell = cells[at];
    const timeCell = cells[at + 1] ?? "";
    const label = cells[at + 2] ?? "";
    const buyersCell = cells[at + 3] ?? "";
    const team = cells[at + 4] ?? "";

    const difficultyAt = cells.findIndex(
      (c, i) => i > at + 3 && DIFFICULTY_BY_NAME[c.toLowerCase()] !== undefined
    );
    const difficultyCell = difficultyAt === -1 ? "" : cells[difficultyAt];

    const dateMatch = dateCell.match(ROW_DATE)!;
    const time = to24h(timeCell);
    const buyers = buyersCell.match(ROW_BUYERS);
    const difficulty = DIFFICULTY_BY_NAME[difficultyCell.toLowerCase()];

    if (!time) {
      warnings.push(`"${label || dateCell}": no se entendió la hora "${timeCell}", se omitió.`);
      continue;
    }
    if (!buyers) {
      warnings.push(`"${label || dateCell}": no se entendieron los cupos "${buyersCell}", se omitió.`);
      continue;
    }
    if (!difficulty) {
      warnings.push(
        `"${label || dateCell}": no se encontró la dificultad (Normal, Heroic o Mythic) en la fila, se omitió.`
      );
      continue;
    }
    if (team && team.toLowerCase() !== OWN_TEAM) {
      otrosEquipos.add(team);
      continue;
    }

    const scheduled = resolveYear(Number(dateMatch[1]), Number(dateMatch[2]), time, now);
    if (Number.isNaN(scheduled.getTime())) {
      warnings.push(`"${label || dateCell}": no se pudo armar la fecha, se omitió.`);
      continue;
    }

    const booked = Number(buyers[1]);
    const capacity = Number(buyers[2]);
    if (capacity < 1 || booked > capacity) {
      warnings.push(`"${label}": cupos inconsistentes (${buyersCell}), se omitió.`);
      continue;
    }

    slots.push({
      scheduledAt: scheduled.toISOString(),
      difficulty,
      label,
      capacity,
      bookedCount: booked,
      externalId: null,
    });
  }

  if (otrosEquipos.size > 0) {
    warnings.push(
      `Se omitieron las runs de otro equipo (${[...otrosEquipos].join(", ")}): la tienda solo publica las de GG.`
    );
  }

  return { slots, warnings };
}

export function slotKey(parts: { scheduledAt: string; label: string }): string {
  return `${new Date(parts.scheduledAt).toISOString()}::${parts.label.trim().toLowerCase()}`;
}

export function offerKey(parts: {
  category: string;
  groupLabel: string;
  titleEn: string;
}): string {
  return [parts.category, parts.groupLabel.trim(), parts.titleEn.trim()]
    .map((p) => p.toLowerCase())
    .join("::");
}

const API_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const API_TIME = /^(\d{1,2}):(\d{2})$/;

interface ApiRun {
  id?: unknown;
  date?: unknown;
  time?: unknown;
  difficulty?: unknown;
  raid?: unknown;
  team?: unknown;
  maxBuyers?: unknown;
  slotAvailable?: unknown;
}

export function parseBoostRunsJson(raw: unknown, now: Date = new Date()): ParsedSchedule {
  const slots: ParsedSlot[] = [];
  const warnings: string[] = [];
  const otrosEquipos = new Set<string>();

  const payload = (raw ?? {}) as { info?: unknown };
  const runs = Array.isArray(payload.info) ? payload.info : null;
  if (!runs) {
    warnings.push("La respuesta no traía una lista de runs.");
    return { slots, warnings };
  }

  for (const entry of runs) {
    if (!entry || typeof entry !== "object") continue;
    const run = entry as ApiRun;

    const team = typeof run.team === "string" ? run.team : "";
    if (team && team.toLowerCase() !== OWN_TEAM) {
      otrosEquipos.add(team);
      continue;
    }

    const label = typeof run.raid === "string" ? run.raid.trim() : "";
    const rotulo = label || (typeof run.id === "number" ? `run ${run.id}` : "una run");

    const dateMatch = typeof run.date === "string" ? run.date.match(API_DATE) : null;
    const timeMatch = typeof run.time === "string" ? run.time.match(API_TIME) : null;
    if (!dateMatch || !timeMatch) {
      warnings.push(`"${rotulo}": fecha u hora ilegibles ("${String(run.date)} ${String(run.time)}"), se omitió.`);
      continue;
    }

    const hour = Number(timeMatch[1]);
    const minute = Number(timeMatch[2]);
    if (hour > 23 || minute > 59) {
      warnings.push(`"${rotulo}": hora fuera de rango ("${String(run.time)}"), se omitió.`);
      continue;
    }

    const difficulty =
      typeof run.difficulty === "string" ? DIFFICULTY_BY_NAME[run.difficulty.toLowerCase()] : undefined;
    if (!difficulty) {
      warnings.push(`"${rotulo}": dificultad desconocida ("${String(run.difficulty)}"), se omitió.`);
      continue;
    }

    const capacity = Number(run.maxBuyers);
    const libres = Number(run.slotAvailable);
    if (!Number.isFinite(capacity) || capacity < 1) {
      warnings.push(`"${rotulo}": cupo total inválido ("${String(run.maxBuyers)}"), se omitió.`);
      continue;
    }
    if (!Number.isFinite(libres) || libres < 0) {
      warnings.push(`"${rotulo}": cupos libres inválidos ("${String(run.slotAvailable)}"), se omitió.`);
      continue;
    }

    const scheduled = zonedTimeToUtc(
      `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`,
      `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
      SCHEDULE_TIMEZONE
    );
    if (Number.isNaN(scheduled.getTime())) {
      warnings.push(`"${rotulo}": no se pudo armar la fecha, se omitió.`);
      continue;
    }

    slots.push({
      scheduledAt: scheduled.toISOString(),
      difficulty,
      label,
      capacity: Math.round(capacity),
      bookedCount: Math.max(Math.round(capacity) - Math.round(libres), 0),
      externalId: typeof run.id === "number" && Number.isFinite(run.id) ? run.id : null,
    });
  }

  if (otrosEquipos.size > 0) {
    warnings.push(
      `Se omitieron las runs de otro equipo (${[...otrosEquipos].join(", ")}): la tienda solo publica las de GG.`
    );
  }

  void now;

  return { slots, warnings };
}
