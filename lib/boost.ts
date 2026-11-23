import { GUILD_TIMEZONE } from "@/lib/guild-day";
import { shiftDateKey, zonedDateKey, zonedTimeToUtc } from "@/lib/timezone";

export const BOOST_CATEGORIES = ["normal", "heroic", "mythic"] as const;
export type BoostCategory = (typeof BOOST_CATEGORIES)[number];

export const BOOST_STATUSES = ["pending", "confirmed", "completed", "cancelled"] as const;
export type BoostStatus = (typeof BOOST_STATUSES)[number];

export const BOOST_REGION = "us";
export type BoostRegion = typeof BOOST_REGION;

export function isBoostCategory(value: unknown): value is BoostCategory {
  return typeof value === "string" && (BOOST_CATEGORIES as readonly string[]).includes(value);
}

export function isBoostRegion(value: unknown): value is BoostRegion {
  return value === BOOST_REGION;
}

export function isBoostStatus(value: unknown): value is BoostStatus {
  return typeof value === "string" && (BOOST_STATUSES as readonly string[]).includes(value);
}

export function remainingCapacity(
  capacity: number,
  bookedCount: number,
  localHoldCount: number
): number {
  return Math.max(capacity - bookedCount - localHoldCount, 0);
}

export function isSlotBookable(
  slot: {
    scheduledAt: string | Date;
    capacity: number;
    bookedCount: number;
    localHoldCount: number;
    isActive: boolean;
  },
  now: Date = new Date()
): boolean {
  if (!isSlotVisible(slot, now)) return false;
  return remainingCapacity(slot.capacity, slot.bookedCount, slot.localHoldCount) > 0;
}

export function isSlotVisible(
  slot: { scheduledAt: string | Date; isActive: boolean },
  now: Date = new Date()
): boolean {
  if (!slot.isActive) return false;
  const scheduled = slot.scheduledAt instanceof Date ? slot.scheduledAt : new Date(slot.scheduledAt);
  if (Number.isNaN(scheduled.getTime())) return false;

  return runWindowEnd(scheduled).getTime() > now.getTime();
}

export const BOOST_RUN_WINDOW_HOURS = 2;

export function runWindowEnd(scheduledAt: string | Date): Date {
  const inicio = scheduledAt instanceof Date ? scheduledAt : new Date(scheduledAt);
  return new Date(inicio.getTime() + BOOST_RUN_WINDOW_HOURS * 60 * 60 * 1000);
}

export function slotQueryFloor(now: Date = new Date()): Date {
  return new Date(now.getTime() - BOOST_RUN_WINDOW_HOURS * 60 * 60 * 1000);
}

export const BOOST_SLOT_PRUNE_HOURS = 3;

export function slotPruneCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - BOOST_SLOT_PRUNE_HOURS * 60 * 60 * 1000);
}

export const BOOST_SOURCES = ["package", "run"] as const;
export type BoostSource = (typeof BOOST_SOURCES)[number];

export function isBoostSource(value: unknown): value is BoostSource {
  return typeof value === "string" && (BOOST_SOURCES as readonly string[]).includes(value);
}

export interface SchedulingWindow {
  start: Date;
  end: Date;
}

export function boostSchedulingWindow(now: Date = new Date()): SchedulingWindow {
  const todayKey = zonedDateKey(now, GUILD_TIMEZONE);
  const weekday = new Date(`${todayKey}T00:00:00Z`).getUTCDay();
  const mondayKey = shiftDateKey(todayKey, -((weekday + 6) % 7));
  const sundayKey = shiftDateKey(mondayKey, 13);

  return {
    start: zonedTimeToUtc(mondayKey, "00:00", GUILD_TIMEZONE),
    end: new Date(zonedTimeToUtc(sundayKey, "23:59", GUILD_TIMEZONE).getTime() + 59_999),
  };
}

export function isWithinSchedulingWindow(date: Date, now: Date = new Date()): boolean {
  if (Number.isNaN(date.getTime())) return false;
  const { start, end } = boostSchedulingWindow(now);
  return date.getTime() >= start.getTime() && date.getTime() <= end.getTime();
}

const OFFER_JARGON = /\b(?:UN)?SAVED\b|\bVIP\b|\b(FP|ATP)(\d+)?(\s*\d+\s*\/\s*\d+)?(\s*\d+)?/g;

export interface TitleSegment {
  text: string;
  jargon: boolean;
}

export function splitOfferTitle(title: string): TitleSegment[] {
  const segments: TitleSegment[] = [];
  let last = 0;

  const push = (text: string, jargon: boolean) => {
    if (!text) return;
    const previous = segments[segments.length - 1];
    if (previous && previous.jargon === jargon) previous.text += text;
    else segments.push({ text, jargon });
  };

  for (const match of title.matchAll(OFFER_JARGON)) {
    const start = match.index ?? 0;
    if (start > last) push(title.slice(last, start), false);

    const [whole, term, attached, bosses, level] = match;
    if (term) {
      push(term + (attached ?? ""), true);
      push(bosses ?? "", false);
      push(level ?? "", true);
    } else {
      push(whole, true);
    }

    last = start + whole.length;
  }

  push(title.slice(last), false);
  return segments;
}

export function realmSlug(realm: string): string {
  return realm
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’.]/g, "")
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function isPlausibleCharacterName(name: string): boolean {
  const trimmed = name.trim();
  if (trimmed.length < 2 || trimmed.length > 12) return false;
  return /^[\p{L}]+$/u.test(trimmed);
}

const SLUG_MAX = 24;

export function raiderSlugCandidates(displayName: string, randomSuffixes: string[] = []): string[] {
  const base = realmSlug(displayName).slice(0, SLUG_MAX).replace(/-+$/g, "");
  const candidates: string[] = [];
  if (base.length >= 2) candidates.push(base);
  for (const suffix of randomSuffixes) {
    const clean = suffix.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!clean) continue;
    candidates.push(base.length >= 2 ? `${base.slice(0, SLUG_MAX - clean.length - 1)}-${clean}` : `gg-${clean}`);
  }
  return candidates;
}

export function formatGold(amount: number, lang: "en" | "es" = "en"): string {
  return new Intl.NumberFormat(lang === "es" ? "es-CL" : "en-US").format(Math.round(amount));
}

export const MIN_FORM_SECONDS = 3;
export const MAX_FORM_SECONDS = 60 * 60;

export function isHoneypotTripped(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export type FormTimingVerdict = "ok" | "too_fast" | "expired";

export function checkFormTiming(
  issuedAtMs: number,
  now: number = Date.now(),
  minSeconds: number = MIN_FORM_SECONDS,
  maxSeconds: number = MAX_FORM_SECONDS
): FormTimingVerdict {
  const elapsed = (now - issuedAtMs) / 1000;
  if (elapsed < minSeconds) return "too_fast";
  if (elapsed > maxSeconds) return "expired";
  return "ok";
}

export const MAX_BOOKINGS_PER_BUYER = 3;
export const BOOKING_WINDOW_MINUTES = 30;

export function isRateLimited(recentCount: number, max: number = MAX_BOOKINGS_PER_BUYER): boolean {
  return recentCount >= max;
}

export function getBoostRedirectUri(): string {
  return `${process.env.NEXTAUTH_URL}/api/boost/discord/callback`;
}
