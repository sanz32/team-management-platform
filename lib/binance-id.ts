const FORBIDDEN_CHARS = /[,\r\n]/;
const MAX_LENGTH = 120;

export type BinanceIdValidation = { value: string | null } | { error: string };

export function validateBinanceId(raw: string | null | undefined): BinanceIdValidation {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed) return { value: null };

  if (FORBIDDEN_CHARS.test(trimmed)) {
    return { error: "El Binance ID no puede contener comas ni saltos de línea" };
  }
  if (trimmed.length > MAX_LENGTH) {
    return { error: `El Binance ID no puede superar los ${MAX_LENGTH} caracteres` };
  }

  return { value: trimmed };
}
