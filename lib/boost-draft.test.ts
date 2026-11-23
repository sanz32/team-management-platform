import { describe, it, expect, beforeAll } from "vitest";

beforeAll(() => {
  process.env.NEXTAUTH_SECRET = "secreto-de-prueba-para-boost-draft";
});

const {
  issueFormToken,
  readFormToken,
  encodeDraft,
  decodeDraft,
  hashIp,
  randomToken,
  BOOST_DRAFT_MAX_AGE_SECONDS,
} = await import("./boost-draft");

function draft(overrides: Record<string, unknown> = {}) {
  return {
    state: "abc123",
    offerId: "11111111-1111-1111-1111-111111111111",
    slotId: null,
    raiderSlug: "arden",
    characterName: "Nèry",
    characterRealm: "Zul'jin",
    characterRealmSlug: "zuljin",
    characterRegion: "us",
    characterClass: "Monk",
    characterSpec: "Mistweaver",
    characterIlvl: 720,
    note: null,
    issuedAt: Date.now(),
    ...overrides,
  } as Parameters<typeof encodeDraft>[0];
}

describe("token de formulario", () => {
  it("devuelve el instante de emisión intacto", () => {
    const now = 1_700_000_000_000;
    expect(readFormToken(issueFormToken(now))).toBe(now);
  });

  it("rechaza un token manipulado", () => {
    const token = issueFormToken(Date.now());
    const [payload, signature] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ t: 1 }), "utf8").toString("base64url");
    expect(readFormToken(`${forged}.${signature}`)).toBeNull();
    expect(readFormToken(`${payload}.deadbeef`)).toBeNull();
  });

  it("rechaza basura y vacíos sin tirar", () => {
    expect(readFormToken("")).toBeNull();
    expect(readFormToken(undefined)).toBeNull();
    expect(readFormToken("sin-punto")).toBeNull();
    expect(readFormToken("a.b.c")).toBeNull();
  });
});

describe("borrador de la reserva", () => {
  it("va y vuelve sin perder ningún campo", () => {
    const original = draft();
    const decoded = decodeDraft(encodeDraft(original));
    expect(decoded).toEqual(original);
  });

  it("conserva los acentos del personaje", () => {
    const decoded = decodeDraft(encodeDraft(draft({ characterName: "Nërÿ" })));
    expect(decoded?.characterName).toBe("Nërÿ");
  });

  it("rechaza un borrador editado a mano", () => {
    const token = encodeDraft(draft());
    const signature = token.split(".")[1];
    const forged = Buffer.from(JSON.stringify(draft({ raiderSlug: "otro" })), "utf8").toString("base64url");
    expect(decodeDraft(`${forged}.${signature}`)).toBeNull();
  });

  it("rechaza un borrador vencido aunque la firma sea válida", () => {
    const old = draft({ issuedAt: Date.now() - (BOOST_DRAFT_MAX_AGE_SECONDS + 60) * 1000 });
    expect(decodeDraft(encodeDraft(old))).toBeNull();
  });

  it("rechaza un borrador al que le falta lo esencial", () => {
    expect(decodeDraft(encodeDraft(draft({ state: "" })))).toBeNull();
    expect(decodeDraft(encodeDraft(draft({ characterName: "" })))).toBeNull();
  });

  it("acepta el camino de RUN: paquete + corrida", () => {
    const decoded = decodeDraft(
      encodeDraft(draft({ slotId: "22222222-2222-2222-2222-222222222222" }))
    );
    expect(decoded?.slotId).toBe("22222222-2222-2222-2222-222222222222");
    expect(decoded?.offerId).toBe("11111111-1111-1111-1111-111111111111");
  });

  it("rechaza un borrador sin paquete", () => {
    expect(decodeDraft(encodeDraft(draft({ offerId: "" })))).toBeNull();
    expect(decodeDraft(encodeDraft(draft({ offerId: null })))).toBeNull();
  });

  it("acepta un borrador sin ref de Raider (lead sin asignar)", () => {
    const decoded = decodeDraft(encodeDraft(draft({ raiderSlug: null })));
    expect(decoded?.raiderSlug).toBeNull();
  });
});

describe("hashIp", () => {
  it("es estable para la misma IP y distinto para otra", () => {
    expect(hashIp("203.0.113.7")).toBe(hashIp("203.0.113.7"));
    expect(hashIp("203.0.113.7")).not.toBe(hashIp("203.0.113.8"));
  });

  it("nunca devuelve la IP en claro", () => {
    expect(hashIp("203.0.113.7")).not.toContain("203.0.113.7");
  });

  it("tolera no tener IP", () => {
    expect(hashIp(null)).toBeNull();
    expect(hashIp(undefined)).toBeNull();
  });
});

describe("randomToken", () => {
  it("no se repite entre llamadas", () => {
    const tokens = new Set(Array.from({ length: 50 }, () => randomToken()));
    expect(tokens.size).toBe(50);
  });
});
