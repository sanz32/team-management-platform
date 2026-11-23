import crypto from "crypto";

const FORM_TOKEN_PURPOSE = "boost-form";
const DRAFT_PURPOSE = "boost-draft";

export const BOOST_DRAFT_COOKIE = "boost_draft";
export const BOOST_DRAFT_MAX_AGE_SECONDS = 600;

function secret(): string {
  const value = process.env.NEXTAUTH_SECRET;
  if (!value) {
    throw new Error("Falta NEXTAUTH_SECRET para firmar el borrador de reserva");
  }
  return value;
}

function sign(purpose: string, payload: string): string {
  return crypto.createHmac("sha256", secret()).update(`${purpose}.${payload}`).digest("base64url");
}

function signatureMatches(expected: string, received: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function encode(purpose: string, data: unknown): string {
  const payload = Buffer.from(JSON.stringify(data), "utf8").toString("base64url");
  return `${payload}.${sign(purpose, payload)}`;
}

function decode<T>(purpose: string, token: string | undefined | null): T | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload, signature] = parts;
  if (!signatureMatches(sign(purpose, payload), signature)) return null;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

export function issueFormToken(now: number = Date.now()): string {
  return encode(FORM_TOKEN_PURPOSE, { t: now });
}

export function readFormToken(token: string | undefined | null): number | null {
  const data = decode<{ t?: unknown }>(FORM_TOKEN_PURPOSE, token);
  if (!data || typeof data.t !== "number" || !Number.isFinite(data.t)) return null;
  return data.t;
}

export interface BoostDraft {
  state: string;
  offerId: string;
  slotId: string | null;
  raiderSlug: string | null;
  characterName: string;
  characterRealm: string;
  characterRealmSlug: string;
  characterRegion: string;
  characterClass: string | null;
  characterSpec: string | null;
  characterIlvl: number | null;
  note: string | null;
  dealDayKey: string | null;
  issuedAt: number;
}

export function encodeDraft(draft: BoostDraft): string {
  return encode(DRAFT_PURPOSE, draft);
}

export function decodeDraft(
  token: string | undefined | null,
  now: number = Date.now()
): BoostDraft | null {
  const draft = decode<BoostDraft>(DRAFT_PURPOSE, token);
  if (!draft) return null;
  if (typeof draft.issuedAt !== "number") return null;
  if (now - draft.issuedAt > BOOST_DRAFT_MAX_AGE_SECONDS * 1000) return null;
  if (!draft.state || !draft.characterName || !draft.offerId) return null;
  return draft;
}

export function randomToken(bytes: number = 16): string {
  return crypto.randomBytes(bytes).toString("hex");
}

export function hashIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  return crypto.createHmac("sha256", secret()).update(`ip.${ip}`).digest("hex").slice(0, 32);
}
