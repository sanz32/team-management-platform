import { describe, it, expect } from "vitest";
import { RateLimiter, clientIpFromHeaders } from "./boost-rate-limit";

describe("RateLimiter", () => {
  it("deja pasar hasta el máximo y frena el siguiente", () => {
    const limiter = new RateLimiter(3, 60_000);
    expect(limiter.check("a", 0)).toBe(true);
    expect(limiter.check("a", 0)).toBe(true);
    expect(limiter.check("a", 0)).toBe(true);
    expect(limiter.check("a", 0)).toBe(false);
  });

  it("cuenta cada origen por separado", () => {
    const limiter = new RateLimiter(1, 60_000);
    expect(limiter.check("a", 0)).toBe(true);
    expect(limiter.check("b", 0)).toBe(true);
    expect(limiter.check("a", 0)).toBe(false);
  });

  it("vuelve a dejar pasar cuando pasa la ventana", () => {
    const limiter = new RateLimiter(1, 60_000);
    expect(limiter.check("a", 0)).toBe(true);
    expect(limiter.check("a", 59_000)).toBe(false);
    expect(limiter.check("a", 60_001)).toBe(true);
  });

  it("no acumula entradas vencidas para siempre", () => {
    const limiter = new RateLimiter(1, 1_000);
    for (let i = 0; i < 600; i++) limiter.check(`ip-${i}`, 0);
    expect(limiter.size).toBe(600);
    limiter.check("otra", 5_000);
    expect(limiter.size).toBe(1);
  });
});

describe("clientIpFromHeaders", () => {
  it("se queda con la primera IP de x-forwarded-for", () => {
    const headers = new Headers({ "x-forwarded-for": "203.0.113.7, 70.41.3.18, 150.172.238.178" });
    expect(clientIpFromHeaders(headers)).toBe("203.0.113.7");
  });

  it("cae a x-real-ip si no hay forwarded", () => {
    expect(clientIpFromHeaders(new Headers({ "x-real-ip": "203.0.113.9" }))).toBe("203.0.113.9");
  });

  it("devuelve null si no hay ninguna cabecera confiable", () => {
    expect(clientIpFromHeaders(new Headers())).toBeNull();
  });
});
