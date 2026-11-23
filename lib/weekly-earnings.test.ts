import { describe, expect, it } from "vitest";
import { getEarningsWeekRange } from "@/lib/weekly-earnings";

describe("getEarningsWeekRange", () => {
  it("corta martes 00:00 a lunes 23:59 UTC cuando la referencia cae un miercoles", () => {
    const { start, end } = getEarningsWeekRange(new Date("2026-07-29T12:00:00.000Z"));
    expect(start).toBe("2026-07-28");
    expect(end).toBe("2026-08-03");
  });

  it("si la referencia YA es martes, la semana arranca ese mismo dia", () => {
    const { start, end } = getEarningsWeekRange(new Date("2026-07-28T00:00:00.000Z"));
    expect(start).toBe("2026-07-28");
    expect(end).toBe("2026-08-03");
  });

  it("si la referencia es lunes, pertenece a la semana que TERMINA ese dia (no a la siguiente)", () => {
    const { start, end } = getEarningsWeekRange(new Date("2026-08-03T23:00:00.000Z"));
    expect(start).toBe("2026-07-28");
    expect(end).toBe("2026-08-03");
  });

  it("domingo cae en la semana de su martes anterior", () => {
    const { start, end } = getEarningsWeekRange(new Date("2026-08-02T05:00:00.000Z"));
    expect(start).toBe("2026-07-28");
    expect(end).toBe("2026-08-03");
  });
});
