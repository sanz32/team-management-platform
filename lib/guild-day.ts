import { zonedParts, zonedDateKey, shiftDateKey, zonedTimeToUtc } from "@/lib/timezone";

export const GUILD_TIMEZONE = "America/Santiago";
export const ACTIVITY_ENTRY_TIME = "17:45";
export const ACTIVITY_EXIT_TIME = "02:00";
export const DAY_MS = 24 * 60 * 60 * 1000;

export { shiftDateKey };

export function guildDateKey(date: Date = new Date()): string {
  return zonedDateKey(date, GUILD_TIMEZONE);
}

export function getGuildToday(now: Date = new Date()): string {
  const { dateKey, time } = zonedParts(now, GUILD_TIMEZONE);
  return time < ACTIVITY_EXIT_TIME ? shiftDateKey(dateKey, -1) : dateKey;
}

export function isGuildDayPast(dateKey: string, now: Date = new Date()): boolean {
  return dateKey < getGuildToday(now);
}

export function guildTimeAsUtc(dateKey: string, time: string): Date {
  return zonedTimeToUtc(dateKey, time, GUILD_TIMEZONE);
}
