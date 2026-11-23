import { describe, it, expect } from "vitest";
import {
  canRequestRefresh,
  isRefreshPending,
  REFRESH_PENDING_TTL_MS,
  REFRESH_THROTTLE_MS,
  type RefreshSignal,
} from "./boost-refresh-signal";

const AHORA = new Date("2026-09-10T12:00:00Z");

function hace(ms: number): string {
  return new Date(AHORA.getTime() - ms).toISOString();
}

function senal(requestedHaceMs: number, syncedHaceMs: number): RefreshSignal {
  return { requestedAt: hace(requestedHaceMs), syncedAt: hace(syncedHaceMs) };
}

describe("isRefreshPending", () => {
  it("hay refresco en camino si el pedido es posterior a la última sync", () => {
    expect(isRefreshPending(senal(2_000, 60_000), AHORA)).toBe(true);
  });

  it("no hay nada esperando si ya se atendió", () => {
    expect(isRefreshPending(senal(10_000, 3_000), AHORA)).toBe(false);
  });

  it("un pedido viejo sin atender se da por perdido", () => {
    expect(isRefreshPending(senal(REFRESH_PENDING_TTL_MS + 1_000, 999_000), AHORA)).toBe(false);
    expect(isRefreshPending(senal(REFRESH_PENDING_TTL_MS - 1_000, 999_000), AHORA)).toBe(true);
  });

  it("sin señal (migración sin correr) no espera nada", () => {
    expect(isRefreshPending(null, AHORA)).toBe(false);
  });

  it("una fecha ilegible no deja la pantalla esperando", () => {
    expect(isRefreshPending({ requestedAt: "ayer", syncedAt: hace(1_000) }, AHORA)).toBe(false);
  });
});

describe("canRequestRefresh", () => {
  it("deja pedir si el último pedido ya es viejo", () => {
    expect(canRequestRefresh(senal(REFRESH_THROTTLE_MS + 1_000, 999_000), AHORA)).toBe(true);
  });

  it("frena los pedidos seguidos", () => {
    expect(canRequestRefresh(senal(1_000, 999_000), AHORA)).toBe(false);
  });

  it("sin señal se puede pedir", () => {
    expect(canRequestRefresh(null, AHORA)).toBe(true);
  });
});

describe("lo que ve el comprador al entrar", () => {
  const espera = (s: RefreshSignal | null) =>
    isRefreshPending(s, AHORA) || canRequestRefresh(s, AHORA);

  it("espera cuando otro acaba de pedir y todavía no llegó", () => {
    expect(espera(senal(3_000, 60_000))).toBe(true);
  });

  it("espera cuando le toca pedir a él", () => {
    expect(espera(senal(120_000, 110_000))).toBe(true);
  });

  it("NO espera si los cupos se acaban de traer", () => {
    expect(espera(senal(20_000, 15_000))).toBe(false);
  });
});
