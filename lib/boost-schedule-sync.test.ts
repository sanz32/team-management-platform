import { describe, it, expect } from "vitest";
import { slotsToDeactivate, type ExistingSlot } from "./boost-schedule-sync";

const AHORA = new Date("2026-09-11T22:45:00Z");

const DIAS = ["2026-09-11", "2026-09-12"];

function slot(over: Partial<ExistingSlot> = {}): ExistingSlot {
  return {
    id: "s1",
    scheduled_at: "2026-09-12T00:00:00Z",
    label: "LAST TWO KILL SPAM",
    capacity: 13,
    booked_count: 0,
    external_id: 21506,
    is_active: true,
    ...over,
  };
}

const NADA_VISTO = new Set<string>();

describe("slotsToDeactivate", () => {
  it("desactiva una run FUTURA que la plataforma ya no lista: la cancelaron", () => {
    const r = slotsToDeactivate([slot()], DIAS, NADA_VISTO, AHORA);
    expect(r.map((x) => x.id)).toEqual(["s1"]);
  });

  it("NO desactiva una run que YA ARRANCÓ, aunque no venga en el sync", () => {
    const enCurso = slot({
      id: "encurso",
      scheduled_at: "2026-09-11T22:00:00Z",
      booked_count: 6,
      external_id: 21295,
    });
    expect(slotsToDeactivate([enCurso], DIAS, NADA_VISTO, AHORA)).toEqual([]);
  });

  it("tampoco desactiva una que arrancó justo en este instante", () => {
    const justoAhora = slot({ scheduled_at: AHORA.toISOString() });
    expect(slotsToDeactivate([justoAhora], DIAS, NADA_VISTO, AHORA)).toEqual([]);
  });

  it("distingue las dos por un minuto: la de un minuto ANTES no se toca", () => {
    const unMinutoAntes = slot({ id: "antes", scheduled_at: "2026-09-11T22:44:00Z" });
    const unMinutoDespues = slot({ id: "despues", scheduled_at: "2026-09-11T22:46:00Z" });
    const r = slotsToDeactivate([unMinutoAntes, unMinutoDespues], DIAS, NADA_VISTO, AHORA);
    expect(r.map((x) => x.id)).toEqual(["despues"]);
  });

  it("NUNCA toca una run cargada a mano (sin external_id)", () => {
    const aMano = slot({ external_id: null });
    expect(slotsToDeactivate([aMano], DIAS, NADA_VISTO, AHORA)).toEqual([]);
  });

  it("no toca una que SÍ vino en la sincronización", () => {
    const vista = new Set(["s1"]);
    expect(slotsToDeactivate([slot()], DIAS, vista, AHORA)).toEqual([]);
  });

  it("no vuelve a desactivar una que ya estaba inactiva", () => {
    expect(slotsToDeactivate([slot({ is_active: false })], DIAS, NADA_VISTO, AHORA)).toEqual([]);
  });

  it("no toca runs de un día que no se sincronizó", () => {
    const otroDia = slot({ scheduled_at: "2026-09-20T00:00:00Z" });
    expect(slotsToDeactivate([otroDia], DIAS, NADA_VISTO, AHORA)).toEqual([]);
  });

  it("sin syncedDates no desactiva NADA (es el pegado manual)", () => {
    expect(slotsToDeactivate([slot()], undefined, NADA_VISTO, AHORA)).toEqual([]);
    expect(slotsToDeactivate([slot()], [], NADA_VISTO, AHORA)).toEqual([]);
  });

  it("ignora una fecha ilegible en vez de desactivarla", () => {
    const roto = slot({ scheduled_at: "mañana" });
    expect(slotsToDeactivate([roto], DIAS, NADA_VISTO, AHORA)).toEqual([]);
  });

  it("el día de la agenda es un día de NUEVA YORK, no de UTC", () => {
    const nocheDelOnce = slot({ scheduled_at: "2026-09-12T03:00:00Z" });
    const r = slotsToDeactivate([nocheDelOnce], ["2026-09-11"], NADA_VISTO, AHORA);
    expect(r.map((x) => x.id)).toEqual(["s1"]);
  });
});
