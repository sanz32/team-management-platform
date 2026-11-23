function formatterFor(timeZone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
}

export function zonedParts(date: Date, timeZone: string): { dateKey: string; time: string } {
  const parts = formatterFor(timeZone).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)!.value;
  return {
    dateKey: `${value("year")}-${value("month")}-${value("day")}`,
    time: `${value("hour")}:${value("minute")}`,
  };
}

export function zonedDateKey(date: Date, timeZone: string): string {
  return zonedParts(date, timeZone).dateKey;
}

export function shiftDateKey(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function zonedTimeToUtc(dateKey: string, time: string, timeZone: string): Date {
  const guess = new Date(`${dateKey}T${time}:00Z`);
  const asIfZone = new Date(guess.toLocaleString("en-US", { timeZone }));
  const asIfUtc = new Date(guess.toLocaleString("en-US", { timeZone: "UTC" }));
  const offset = asIfUtc.getTime() - asIfZone.getTime();
  return new Date(guess.getTime() + offset);
}
