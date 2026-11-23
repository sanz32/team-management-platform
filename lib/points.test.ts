import { describe, expect, it } from "vitest";
import {
  createAppeal,
  createPoint,
  getCurrentPointsWeek,
  PointAppealError,
  PointValidationError,
  resolveAppeal,
  scopedTotalsFromRows,
  shiftPointsWeek,
  totalsFromRows,
  updatePoint,
  type GuildPointRow,
} from "@/lib/points";
import { createFakeSupabase } from "@/lib/test-utils/fake-supabase";

function row(points: number, percent: number, overrides: Partial<GuildPointRow> = {}): GuildPointRow {
  return {
    id: `p-${points}-${percent}-${Math.random()}`,
    userId: "u1",
    points,
    percent,
    scope: "week",
    reason: null,
    wclReportCode: null,
    wclFightId: null,
    wclBossName: null,
    wclKill: null,
    wclStartTime: null,
    hasEvidence: false,
    evidenceUrl: null,
    weekStart: "2026-08-18",
    createdAt: "2026-08-18T16:00:00.000Z",
    reverted: false,
    revertedAt: null,
    appealStatus: null,
    ...overrides,
  };
}

describe("totalsFromRows", () => {
  it("1 punto al 10% son 10 puntos porcentuales, no 0.1", () => {
    expect(totalsFromRows([row(1, 10)])).toEqual({ totalPoints: 1, totalPercentValue: 10 });
  });

  it("multiplica la cantidad de puntos por SU propio porcentaje", () => {
    expect(totalsFromRows([row(3, 10)])).toEqual({ totalPoints: 3, totalPercentValue: 30 });
  });

  it("suma fila por fila cuando la semana mezcla porcentajes distintos", () => {
    const totals = totalsFromRows([row(2, 10), row(1, 5)]);
    expect(totals.totalPoints).toBe(3);
    expect(totals.totalPercentValue).toBe(25);
  });

  it("no arrastra ruido de coma flotante con porcentajes decimales", () => {
    const totals = totalsFromRows([row(1, 12.35), row(1, 7.65)]);
    expect(totals.totalPercentValue).toBe(20);
    expect(totals.totalPercentValue.toString()).toBe("20");
  });

  it("una semana sin filas da cero, no NaN", () => {
    expect(totalsFromRows([])).toEqual({ totalPoints: 0, totalPercentValue: 0 });
  });

  it("un punto revertido no suma, aunque la fila se siga trayendo", () => {
    const totals = totalsFromRows([row(2, 10), row(3, 10, { reverted: true })]);
    expect(totals.totalPoints).toBe(2);
    expect(totals.totalPercentValue).toBe(20);
  });

  it("una semana entera revertida da cero, no el total original", () => {
    expect(totalsFromRows([row(1, 10, { reverted: true })])).toEqual({
      totalPoints: 0,
      totalPercentValue: 0,
    });
  });
});

describe("scopedTotalsFromRows", () => {
  it("separa un punto de semana de un punto de run, nunca los mezcla", () => {
    const totals = scopedTotalsFromRows([
      row(1, 10, { scope: "week" }),
      row(1, 10, { scope: "run" }),
    ]);
    expect(totals.week).toEqual({ totalPoints: 1, totalPercentValue: 10 });
    expect(totals.run).toEqual({ totalPoints: 1, totalPercentValue: 10 });
  });

  it("suma varios puntos del mismo scope entre sí, sin tocar el otro scope", () => {
    const totals = scopedTotalsFromRows([
      row(1, 10, { scope: "week" }),
      row(2, 12.5, { scope: "run" }),
      row(1, 5, { scope: "run" }),
    ]);
    expect(totals.week).toEqual({ totalPoints: 1, totalPercentValue: 10 });
    expect(totals.run).toEqual({ totalPoints: 3, totalPercentValue: 30 });
  });

  it("un scope sin filas da cero, no undefined", () => {
    const totals = scopedTotalsFromRows([row(2, 10, { scope: "week" })]);
    expect(totals.run).toEqual({ totalPoints: 0, totalPercentValue: 0 });
  });

  it("revertir un punto de run no toca el total de la semana", () => {
    const totals = scopedTotalsFromRows([
      row(1, 10, { scope: "week" }),
      row(2, 10, { scope: "run", reverted: true }),
    ]);
    expect(totals.week).toEqual({ totalPoints: 1, totalPercentValue: 10 });
    expect(totals.run).toEqual({ totalPoints: 0, totalPercentValue: 0 });
  });
});

const POINT_ID = "point-1";
const OWNER_ID = "user-owner";
const OTHER_ID = "user-otro";

function seedPoint(overrides: Record<string, unknown> = {}) {
  return {
    id: POINT_ID,
    user_id: OWNER_ID,
    points: 2,
    percent: 10,
    scope: "week",
    reason: "Llegó tarde a la run",
    wcl_report_code: null,
    wcl_fight_id: null,
    wcl_boss_name: null,
    wcl_kill: null,
    evidence_path: null,
    week_start: "2026-08-18",
    created_at: "2026-08-18T16:00:00.000Z",
    reverted: false,
    reverted_at: null,
    ...overrides,
  };
}

function fakeDb(seed: Record<string, Record<string, unknown>[]>) {
  return createFakeSupabase(seed) as unknown as Parameters<typeof createAppeal>[0];
}

describe("createAppeal", () => {
  it("el dueño del punto puede apelarlo y queda pendiente", async () => {
    const db = createFakeSupabase({ guild_points: [seedPoint()], point_appeals: [] });
    const appeal = await createAppeal(db as unknown as Parameters<typeof createAppeal>[0], {
      pointId: POINT_ID,
      requesterId: OWNER_ID,
      reason: "  No fue mi culpa, el server se cayó  ",
    });

    expect(appeal.status).toBe("pending");
    expect(appeal.pointId).toBe(POINT_ID);
    expect(appeal.reason).toBe("No fue mi culpa, el server se cayó");
    expect(db._tables.point_appeals).toHaveLength(1);
  });

  it("nadie puede apelar el punto de otro miembro", async () => {
    const db = fakeDb({ guild_points: [seedPoint()], point_appeals: [] });
    await expect(
      createAppeal(db, { pointId: POINT_ID, requesterId: OTHER_ID, reason: "no me parece" })
    ).rejects.toMatchObject({ status: 403 });
  });

  it("un punto ya revertido no se vuelve a apelar", async () => {
    const db = fakeDb({ guild_points: [seedPoint({ reverted: true })], point_appeals: [] });
    await expect(
      createAppeal(db, { pointId: POINT_ID, requesterId: OWNER_ID, reason: "de nuevo" })
    ).rejects.toMatchObject({ status: 409 });
  });

  it("no se puede abrir una segunda apelación mientras hay una en revisión", async () => {
    const db = fakeDb({
      guild_points: [seedPoint()],
      point_appeals: [
        { id: "a-1", point_id: POINT_ID, requester_id: OWNER_ID, reason: "la primera", status: "pending" },
      ],
    });
    await expect(
      createAppeal(db, { pointId: POINT_ID, requesterId: OWNER_ID, reason: "la segunda" })
    ).rejects.toMatchObject({ status: 409 });
  });

  it("sí se puede volver a apelar después de un rechazo", async () => {
    const db = fakeDb({
      guild_points: [seedPoint()],
      point_appeals: [
        { id: "a-1", point_id: POINT_ID, requester_id: OWNER_ID, reason: "la primera", status: "denied" },
      ],
    });
    const appeal = await createAppeal(db, {
      pointId: POINT_ID,
      requesterId: OWNER_ID,
      reason: "ahora con el log de evidencia",
    });
    expect(appeal.status).toBe("pending");
  });

  it("una apelación sin motivo no se guarda", async () => {
    const db = fakeDb({ guild_points: [seedPoint()], point_appeals: [] });
    await expect(
      createAppeal(db, { pointId: POINT_ID, requesterId: OWNER_ID, reason: "   " })
    ).rejects.toBeInstanceOf(PointAppealError);
  });

  it("apelar un punto que ya no existe da 404, no un error crudo", async () => {
    const db = fakeDb({ guild_points: [], point_appeals: [] });
    await expect(
      createAppeal(db, { pointId: POINT_ID, requesterId: OWNER_ID, reason: "hola" })
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe("resolveAppeal", () => {
  function seedWithPending() {
    return createFakeSupabase({
      guild_points: [seedPoint()],
      point_appeals: [
        {
          id: "a-1",
          point_id: POINT_ID,
          requester_id: OWNER_ID,
          reason: "el server se cayó",
          status: "pending",
          reviewed_by: null,
          reviewed_at: null,
          created_at: "2026-08-19T10:00:00.000Z",
        },
      ],
      app_users: [{ id: OWNER_ID, nickname: "Nery", discord_username: "nery#0", discord_id: "123" }],
    });
  }

  it("aprobar revierte el punto en el MISMO paso", async () => {
    const db = seedWithPending();
    const resolved = await resolveAppeal(db as unknown as Parameters<typeof resolveAppeal>[0], {
      appealId: "a-1",
      approve: true,
      reviewedBy: "rl-1",
    });

    expect(resolved.appeal.status).toBe("approved");
    expect(resolved.point.reverted).toBe(true);
    expect(db._tables.guild_points).toHaveLength(1);
    expect(db._tables.guild_points[0].reverted).toBe(true);
    expect(db._tables.guild_points[0].reverted_at).toBeTruthy();
    expect(resolved.ownerName).toBe("Nery");
    expect(resolved.ownerDiscordId).toBe("123");
  });

  it("rechazar deja el punto exactamente como estaba", async () => {
    const db = seedWithPending();
    const resolved = await resolveAppeal(db as unknown as Parameters<typeof resolveAppeal>[0], {
      appealId: "a-1",
      approve: false,
      reviewedBy: "rl-1",
    });

    expect(resolved.appeal.status).toBe("denied");
    expect(resolved.point.reverted).toBe(false);
    expect(db._tables.guild_points[0].reverted).toBe(false);
    expect(db._tables.guild_points[0].reverted_at).toBeFalsy();
  });

  it("una apelación ya resuelta no se puede volver a resolver", async () => {
    const db = seedWithPending();
    const client = db as unknown as Parameters<typeof resolveAppeal>[0];
    await resolveAppeal(client, { appealId: "a-1", approve: true, reviewedBy: "rl-1" });
    await expect(
      resolveAppeal(client, { appealId: "a-1", approve: false, reviewedBy: "rl-2" })
    ).rejects.toMatchObject({ status: 409 });
  });
});

describe("updatePoint", () => {
  it("corrige el scope de 'week' a 'run' agregando su link -- el caso real que motivó esto", async () => {
    const db = fakeDb({ guild_points: [seedPoint({ scope: "week" })], point_appeals: [] });
    const updated = await updatePoint(db, POINT_ID, {
      scope: "run",
      points: 2,
      percent: 10,
      reason: "Wipe evitable en el jefe 3",
      wclReportCode: "AbCdEfGh",
      wclFightId: 5,
      wclBossName: "Nek'zali the Soulcoiler",
      wclKill: false,
      wclStartTime: "2026-08-18T20:00:00.000Z",
    });

    expect(updated.scope).toBe("run");
    expect(updated.wclReportCode).toBe("AbCdEfGh");
    expect(updated.wclBossName).toBe("Nek'zali the Soulcoiler");
    expect(updated.userId).toBe(OWNER_ID);
    expect(updated.weekStart).toBe("2026-08-18");
  });

  it("edita puntos/motivo sin tocar el link cuando el scope se queda en 'week'", async () => {
    const db = fakeDb({ guild_points: [seedPoint({ points: 1, reason: "motivo viejo" })], point_appeals: [] });
    const updated = await updatePoint(db, POINT_ID, {
      scope: "week",
      points: 3,
      percent: 15,
      reason: "motivo corregido",
    });
    expect(updated.points).toBe(3);
    expect(updated.percent).toBe(15);
    expect(updated.reason).toBe("motivo corregido");
  });

  it("un punto de tipo run sin link no se guarda", async () => {
    const db = fakeDb({ guild_points: [seedPoint()], point_appeals: [] });
    await expect(
      updatePoint(db, POINT_ID, { scope: "run", points: 1, percent: 10, reason: null })
    ).rejects.toBeInstanceOf(PointValidationError);
  });

  it("rechaza una cantidad de puntos que no sea un entero positivo", async () => {
    const db = fakeDb({ guild_points: [seedPoint()], point_appeals: [] });
    await expect(
      updatePoint(db, POINT_ID, { scope: "week", points: 0, percent: 10, reason: null })
    ).rejects.toBeInstanceOf(PointValidationError);
  });

  it("un punto ya revertido por una apelación no se puede editar", async () => {
    const db = fakeDb({ guild_points: [seedPoint({ reverted: true })], point_appeals: [] });
    await expect(
      updatePoint(db, POINT_ID, { scope: "week", points: 1, percent: 10, reason: "intento" })
    ).rejects.toBeInstanceOf(PointValidationError);
  });

  it("un punto con una apelación pendiente no se puede editar", async () => {
    const db = fakeDb({
      guild_points: [seedPoint()],
      point_appeals: [
        { id: "a-1", point_id: POINT_ID, requester_id: OWNER_ID, reason: "en revisión", status: "pending" },
      ],
    });
    await expect(
      updatePoint(db, POINT_ID, { scope: "week", points: 1, percent: 10, reason: "intento" })
    ).rejects.toBeInstanceOf(PointValidationError);
  });

  it("editar un punto que ya no existe da error, no un crash", async () => {
    const db = fakeDb({ guild_points: [], point_appeals: [] });
    await expect(
      updatePoint(db, POINT_ID, { scope: "week", points: 1, percent: 10, reason: null })
    ).rejects.toBeInstanceOf(PointValidationError);
  });
});

describe("createPoint: semana objetivo", () => {
  function fakePointsDb(seed: Record<string, Record<string, unknown>[]> = { guild_points: [], point_appeals: [] }) {
    return createFakeSupabase(seed) as unknown as Parameters<typeof createPoint>[0];
  }

  const basePayload = {
    userId: "u1",
    createdBy: null,
    scope: "week" as const,
    points: 1,
    percent: 10,
    reason: null,
  };

  it("sin weekStart, cae a la semana en curso (comportamiento de siempre)", async () => {
    const point = await createPoint(fakePointsDb(), basePayload);
    expect(point.weekStart).toBe(getCurrentPointsWeek());
  });

  it("acepta una semana futura alineada al reset", async () => {
    const future = shiftPointsWeek(getCurrentPointsWeek(), 2);
    const point = await createPoint(fakePointsDb(), { ...basePayload, weekStart: future });
    expect(point.weekStart).toBe(future);
  });

  it("la semana en curso explícita también es válida (no solo el default)", async () => {
    const current = getCurrentPointsWeek();
    const point = await createPoint(fakePointsDb(), { ...basePayload, weekStart: current });
    expect(point.weekStart).toBe(current);
  });

  it("rechaza una semana que ya pasó -- no hay carga retroactiva", async () => {
    const past = shiftPointsWeek(getCurrentPointsWeek(), -1);
    await expect(createPoint(fakePointsDb(), { ...basePayload, weekStart: past })).rejects.toBeInstanceOf(
      PointValidationError
    );
  });

  it("rechaza una fecha que no cae en el día de reset (payload armado a mano)", async () => {
    const future = shiftPointsWeek(getCurrentPointsWeek(), 1);
    const misalignedDate = new Date(`${future}T00:00:00Z`);
    misalignedDate.setUTCDate(misalignedDate.getUTCDate() + 1);
    const misaligned = misalignedDate.toISOString().slice(0, 10);

    await expect(
      createPoint(fakePointsDb(), { ...basePayload, weekStart: misaligned })
    ).rejects.toBeInstanceOf(PointValidationError);
  });
});

describe("shiftPointsWeek", () => {
  it("se mueve de a semanas completas sin correrse por el huso local", () => {
    expect(shiftPointsWeek("2026-08-18", -1)).toBe("2026-08-11");
    expect(shiftPointsWeek("2026-08-18", 1)).toBe("2026-08-25");
    expect(shiftPointsWeek("2026-08-18", 0)).toBe("2026-08-18");
  });

  it("cruza el cambio de mes y de año", () => {
    expect(shiftPointsWeek("2026-01-05", -1)).toBe("2025-12-29");
    expect(shiftPointsWeek("2026-12-28", 1)).toBe("2027-01-04");
  });
});
