import { describe, it, expect } from "vitest";
import { getGuildToday, guildDateKey, isGuildDayPast, shiftDateKey } from "./guild-day";

describe("getGuildToday", () => {
  it("mantiene el día en curso durante la noche de actividad", () => {
    expect(getGuildToday(new Date("2026-07-29T23:00:00Z"))).toBe("2026-07-29");
  });

  it("sigue en el día anterior después de medianoche y antes de las 02:00", () => {
    expect(getGuildToday(new Date("2026-07-30T05:59:00Z"))).toBe("2026-07-29");
  });

  it("pasa al día siguiente exactamente a las 02:00", () => {
    expect(getGuildToday(new Date("2026-07-30T06:00:00Z"))).toBe("2026-07-30");
  });

  it("no adelanta el cambio de día cuando UTC ya cruzó la medianoche", () => {
    const enPlenaTarde = new Date("2026-07-30T00:30:00Z");
    expect(enPlenaTarde.toISOString().slice(0, 10)).toBe("2026-07-30");
    expect(getGuildToday(enPlenaTarde)).toBe("2026-07-29");
  });

  it("respeta el horario de verano chileno (enero, UTC-3)", () => {
    expect(getGuildToday(new Date("2026-01-15T04:59:00Z"))).toBe("2026-01-14");
    expect(getGuildToday(new Date("2026-01-15T05:00:00Z"))).toBe("2026-01-15");
  });

  it("retrocede bien al cruzar el cambio de mes", () => {
    expect(getGuildToday(new Date("2026-08-01T04:00:00Z"))).toBe("2026-07-31");
  });
});

describe("guildDateKey", () => {
  it("da el día de calendario chileno, sin corrección de jornada", () => {
    expect(guildDateKey(new Date("2026-07-30T05:59:00Z"))).toBe("2026-07-30");
    expect(guildDateKey(new Date("2026-07-30T00:30:00Z"))).toBe("2026-07-29");
  });
});

describe("isGuildDayPast", () => {
  const durantLaNoche = new Date("2026-07-30T05:30:00Z");

  it("no considera pasado el día cuya jornada sigue en curso", () => {
    expect(isGuildDayPast("2026-07-29", durantLaNoche)).toBe(false);
  });

  it("considera pasado el día anterior a la jornada vigente", () => {
    expect(isGuildDayPast("2026-07-28", durantLaNoche)).toBe(true);
  });

  it("nunca considera pasado un día futuro", () => {
    expect(isGuildDayPast("2026-07-30", durantLaNoche)).toBe(false);
    expect(isGuildDayPast("2026-08-05", durantLaNoche)).toBe(false);
  });
});

describe("shiftDateKey", () => {
  it("cruza meses y años sin depender del huso", () => {
    expect(shiftDateKey("2026-08-01", -1)).toBe("2026-07-31");
    expect(shiftDateKey("2026-01-01", -1)).toBe("2025-12-31");
    expect(shiftDateKey("2026-02-28", 1)).toBe("2026-03-01");
  });
});
