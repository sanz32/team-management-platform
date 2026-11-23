import { describe, expect, it } from "vitest";
import { validateBinanceId } from "@/lib/binance-id";

describe("validateBinanceId", () => {
  it("acepta un BUID numérico normal", () => {
    expect(validateBinanceId("123456789")).toEqual({ value: "123456789" });
  });

  it("acepta un email válido", () => {
    expect(validateBinanceId("juan@example.com")).toEqual({ value: "juan@example.com" });
  });

  it("recorta espacios", () => {
    expect(validateBinanceId("  123456789  ")).toEqual({ value: "123456789" });
  });

  it("null/undefined/vacío/solo-espacios se normalizan a value: null", () => {
    expect(validateBinanceId(null)).toEqual({ value: null });
    expect(validateBinanceId(undefined)).toEqual({ value: null });
    expect(validateBinanceId("")).toEqual({ value: null });
    expect(validateBinanceId("   ")).toEqual({ value: null });
  });

  it("rechaza una coma (desalinearía las columnas del CSV)", () => {
    const result = validateBinanceId("1234,5678");
    expect("error" in result).toBe(true);
  });

  it("rechaza un salto de línea \\n (inyectaría una fila nueva en el CSV)", () => {
    const result = validateBinanceId("1234\n999999,ATACANTE,USDT,99999");
    expect("error" in result).toBe(true);
  });

  it("rechaza un retorno de carro \\r", () => {
    const result = validateBinanceId("1234\r5678");
    expect("error" in result).toBe(true);
  });

  it("rechaza más de 120 caracteres", () => {
    const result = validateBinanceId("a".repeat(121));
    expect("error" in result).toBe(true);
  });

  it("acepta exactamente 120 caracteres", () => {
    const value = "a".repeat(120);
    expect(validateBinanceId(value)).toEqual({ value });
  });
});
