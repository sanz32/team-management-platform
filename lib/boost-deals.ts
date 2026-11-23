import { GUILD_TIMEZONE, guildDateKey } from "@/lib/guild-day";
import { shiftDateKey, zonedTimeToUtc } from "@/lib/timezone";
import type { BoostCategory } from "@/lib/boost";

export const DEAL_DISCOUNT_PCT = 10;

export const DEALS_PER_GROUP = 3;

const PRICE_STEP = 1_000;

export interface DealCandidate {
  id: string;
  category: BoostCategory;
  groupLabel: string;
}

export function dealDayKey(now: Date = new Date()): string {
  return guildDateKey(now);
}

export function nextRotationAt(now: Date = new Date()): Date {
  return zonedTimeToUtc(shiftDateKey(dealDayKey(now), 1), "00:00", GUILD_TIMEZONE);
}

export function discountedPriceGold(priceGold: number): number {
  if (!Number.isFinite(priceGold) || priceGold <= 0) return 0;
  const raw = (priceGold * (100 - DEAL_DISCOUNT_PCT)) / 100;
  const rounded = Math.ceil(raw / PRICE_STEP) * PRICE_STEP;
  return Math.min(rounded, priceGold);
}

function hashString(value: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function groupKey(offer: DealCandidate): string {
  return `${offer.category}::${offer.groupLabel}`;
}

export function pickDailyDealIds(offers: DealCandidate[], dayKey: string): Set<string> {
  const groups = new Map<string, DealCandidate[]>();
  for (const offer of offers) {
    const key = groupKey(offer);
    const list = groups.get(key);
    if (list) list.push(offer);
    else groups.set(key, [offer]);
  }

  const chosen = new Set<string>();
  for (const [key, list] of groups) {
    const ordenados = [...list].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const rng = mulberry32(hashString(`${dayKey}::${key}`));

    const cuantos = Math.min(DEALS_PER_GROUP, ordenados.length);
    for (let i = 0; i < cuantos; i++) {
      const j = i + Math.floor(rng() * (ordenados.length - i));
      [ordenados[i], ordenados[j]] = [ordenados[j], ordenados[i]];
      chosen.add(ordenados[i].id);
    }
  }

  return chosen;
}

export function applyDeal(
  priceGold: number,
  enOferta: boolean
): { priceGold: number; listPriceGold: number | null } {
  if (!enOferta) return { priceGold, listPriceGold: null };
  const conDescuento = discountedPriceGold(priceGold);
  if (conDescuento >= priceGold) return { priceGold, listPriceGold: null };
  return { priceGold: conDescuento, listPriceGold: priceGold };
}
