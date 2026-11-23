import { describe, it, expect } from "vitest";
import {
  SYNC_STALE_MINUTES,
  boostSyncHealth,
  formatSinceSync,
} from "./boost-sync-health";

const AHORA = new Date("2026-09-11T18:00:00Z");

function haceMinutos(n: number): string {
  return new Date(AHORA.getTime() - n * 60_000).toISOString();
}

describe("boostSyncHealth", () => {
  it("recién sincronizado está vivo", () => {
    const h = boostSyncHealth({ syncedAt: haceMinutos(1) }, AHORA, 15);
    expect(h.state).toBe("vivo");
    expect(h.minutesSinceSync).toBe(1);
  });

  it("el borde del umbral cuenta como vivo", () => {
    expect(boostSyncHealth({ syncedAt: haceMinutos(SYNC_STALE_MINUTES - 1) }, AHORA, 15).state).toBe(
      "vivo"
    );
    expect(boostSyncHealth({ syncedAt: haceMinutos(SYNC_STALE_MINUTES) }, AHORA, 15).state).toBe(
      "caido"
    );
  });

  it("viejo en horario de venta es caído", () => {
    const h = boostSyncHealth({ syncedAt: haceMinutos(180) }, AHORA, 21);
    expect(h.state).toBe("caido");
    expect(h.minutesSinceSync).toBe(180);
  });

  it("viejo de madrugada es dormido, no caído", () => {
    for (const hora of [3, 5, 8]) {
      expect(boostSyncHealth({ syncedAt: haceMinutos(120) }, AHORA, hora).state).toBe("dormido");
    }
  });

  it("las horas del borde de la pausa se resuelven bien", () => {
    expect(boostSyncHealth({ syncedAt: haceMinutos(120) }, AHORA, 2).state).toBe("caido");
    expect(boostSyncHealth({ syncedAt: haceMinutos(120) }, AHORA, 9).state).toBe("caido");
  });

  it("sin señal o con fecha inválida no afirma nada", () => {
    expect(boostSyncHealth(null, AHORA, 15).state).toBe("desconocido");
    expect(boostSyncHealth({ syncedAt: null }, AHORA, 15).state).toBe("desconocido");
    expect(boostSyncHealth({ syncedAt: "no es fecha" }, AHORA, 15).state).toBe("desconocido");
  });

  it("un reloj adelantado no produce minutos negativos", () => {
    const futuro = new Date(AHORA.getTime() + 5 * 60_000).toISOString();
    const h = boostSyncHealth({ syncedAt: futuro }, AHORA, 15);
    expect(h.minutesSinceSync).toBe(0);
    expect(h.state).toBe("vivo");
  });
});

describe("formatSinceSync", () => {
  it("dice el tiempo en la unidad que se entiende de un vistazo", () => {
    expect(formatSinceSync(null)).toBe("nunca");
    expect(formatSinceSync(0)).toBe("hace menos de un minuto");
    expect(formatSinceSync(7)).toBe("hace 7 min");
    expect(formatSinceSync(60)).toBe("hace 1 h");
    expect(formatSinceSync(130)).toBe("hace 2 h 10 min");
    expect(formatSinceSync(60 * 24)).toBe("hace 1 día");
    expect(formatSinceSync(60 * 24 * 3)).toBe("hace 3 días");
  });
});
