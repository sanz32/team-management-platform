const RESET_WEEKDAY: Record<string, number> = {
  us: 2,
  eu: 3,
  kr: 3,
  tw: 4,
};

const RESET_HOUR_UTC: Record<string, number> = {
  us: 15,
  eu: 4,
  kr: 21,
  tw: 21,
};

export function getLockoutWeekStart(region: string): Date {
  const key = region?.toLowerCase();
  const resetWeekday = RESET_WEEKDAY[key] ?? RESET_WEEKDAY.us;
  const resetHour = RESET_HOUR_UTC[key] ?? RESET_HOUR_UTC.us;

  const now = new Date();
  const today = now.getUTCDay();

  let daysSinceReset = today - resetWeekday;
  if (daysSinceReset < 0) daysSinceReset += 7;

  const boundary = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() - daysSinceReset,
      resetHour,
      0,
      0
    )
  );

  if (boundary.getTime() > now.getTime()) {
    boundary.setUTCDate(boundary.getUTCDate() - 7);
  }

  return boundary;
}

export function getCurrentLockoutWeek(region: string): string {
  return getLockoutWeekStart(region).toISOString().slice(0, 10);
}
