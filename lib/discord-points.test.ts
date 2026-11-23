import { afterEach, describe, expect, it, vi } from "vitest";
import * as discordBot from "@/lib/discord-bot";
import { announcePointAppealCreated, announcePointAppealDecision, announcePointAssigned } from "@/lib/discord-points";
import { getCurrentPointsWeek, shiftPointsWeek } from "@/lib/points";

const CURRENT_WEEK = getCurrentPointsWeek();
const FUTURE_WEEK = shiftPointsWeek(CURRENT_WEEK, 1);

const ORIGINAL = { ...process.env };
afterEach(() => {
  process.env = { ...ORIGINAL };
  vi.restoreAllMocks();
});

describe("discord-points: aviso a RL (webhook)", () => {
  it("sin NINGUNA variable configurada no tira excepción, solo avisa", async () => {
    delete process.env.DISCORD_POINTS_WEBHOOK_URL;
    delete process.env.DISCORD_ROSTER_WEBHOOK_URL;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(announcePointAppealCreated()).resolves.toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
  });

  it("sin la variable propia cae a DISCORD_ROSTER_WEBHOOK_URL", async () => {
    delete process.env.DISCORD_POINTS_WEBHOOK_URL;
    process.env.DISCORD_ROSTER_WEBHOOK_URL = "https://example.invalid/roster";
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue({ ok: true, text: async () => "" } as Response);

    await announcePointAppealCreated();
    expect(fetchSpy.mock.calls[0][0]).toBe("https://example.invalid/roster");
  });

  it("la variable propia gana sobre la del roster", async () => {
    process.env.DISCORD_POINTS_WEBHOOK_URL = "https://example.invalid/puntos";
    process.env.DISCORD_ROSTER_WEBHOOK_URL = "https://example.invalid/roster";
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue({ ok: true, text: async () => "" } as Response);

    await announcePointAppealCreated();
    expect(fetchSpy.mock.calls[0][0]).toBe("https://example.invalid/puntos");
  });

  it("no lleva ningún dato del caso -- la función no recibe parámetros, todo el detalle se ve en la web", async () => {
    process.env.DISCORD_POINTS_WEBHOOK_URL = "https://example.invalid/puntos";
    process.env.NEXTAUTH_URL = "https://example.invalid";
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue({ ok: true, text: async () => "" } as Response);

    await announcePointAppealCreated();

    const init = fetchSpy.mock.calls[0][1]!;
    const body = JSON.parse(init.body as string);
    expect(body.embeds[0].description).toContain("apelación nueva pendiente de revisar");
    expect(body.embeds[0].description).toContain("https://example.invalid/puntos");
    expect(body.embeds[0].description).not.toMatch(/apela el punto|motivo/i);
  });

  it("si Discord falla o la red se cae, no propaga la excepción", async () => {
    process.env.DISCORD_POINTS_WEBHOOK_URL = "https://example.invalid/puntos";
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));

    await expect(announcePointAppealCreated()).resolves.toBeUndefined();
  });
});

describe("discord-points: decisión de apelación (DM)", () => {
  it("apelación aprobada manda un DM en 2ª persona, sin fallback a webhook", async () => {
    const dmSpy = vi.spyOn(discordBot, "sendDirectMessage").mockResolvedValue(true);
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await announcePointAppealDecision({
      memberDiscordId: "999",
      memberName: "DevTest",
      approved: true,
      reviewerName: "RL",
      pointDescription: "punto de prueba",
    });

    expect(dmSpy).toHaveBeenCalledTimes(1);
    const [discordId, content, embed] = dmSpy.mock.calls[0];
    expect(discordId).toBe("999");
    expect(content).toBe("");
    expect(embed!.title).toContain("aprobada");
    expect(embed!.description).toContain("tu descuento");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("apelación rechazada manda el DM con el veredicto correcto", async () => {
    const dmSpy = vi.spyOn(discordBot, "sendDirectMessage").mockResolvedValue(true);

    await announcePointAppealDecision({
      memberDiscordId: "999",
      memberName: "DevTest",
      approved: false,
      reviewerName: "RL",
      pointDescription: "punto de prueba",
    });

    const embed = dmSpy.mock.calls[0][2];
    expect(embed!.title).toContain("rechazada");
    expect(embed!.description).toContain("se mantiene");
  });

  it("sin discord_id no manda DM (no hay canal de reemplazo)", async () => {
    const dmSpy = vi.spyOn(discordBot, "sendDirectMessage").mockResolvedValue(true);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await announcePointAppealDecision({
      memberDiscordId: null,
      memberName: "DevTest",
      approved: false,
      reviewerName: "RL",
      pointDescription: "punto de prueba",
    });

    expect(dmSpy).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
  });
});

describe("discord-points: punto asignado (DM)", () => {
  it("run con kill menciona el jefe y el resultado", async () => {
    const dmSpy = vi.spyOn(discordBot, "sendDirectMessage").mockResolvedValue(true);

    await announcePointAssigned({
      memberDiscordId: "999",
      points: 1,
      scope: "run",
      reason: null,
      bossName: "Onyxia",
      kill: true,
      weekStart: CURRENT_WEEK,
    });

    const embed = dmSpy.mock.calls[0][2];
    expect(embed!.description).toContain("Onyxia");
    expect(embed!.description).toContain("(Kill)");
    expect(embed!.title).toBe("Punto registrado");
  });

  it("run con wipe lo aclara", async () => {
    const dmSpy = vi.spyOn(discordBot, "sendDirectMessage").mockResolvedValue(true);

    await announcePointAssigned({
      memberDiscordId: "999",
      points: 2,
      scope: "run",
      reason: null,
      bossName: "Onyxia",
      kill: false,
      weekStart: CURRENT_WEEK,
    });

    expect(dmSpy.mock.calls[0][2]!.description).toContain("(Wipe)");
  });

  it("punto de semana con motivo lo incluye en el texto", async () => {
    const dmSpy = vi.spyOn(discordBot, "sendDirectMessage").mockResolvedValue(true);

    await announcePointAssigned({
      memberDiscordId: "999",
      points: 1,
      scope: "week",
      reason: "llegó tarde",
      bossName: null,
      kill: null,
      weekStart: CURRENT_WEEK,
    });

    expect(dmSpy.mock.calls[0][2]!.description).toContain("llegó tarde");
  });

  it("sin discord_id no manda nada", async () => {
    const dmSpy = vi.spyOn(discordBot, "sendDirectMessage").mockResolvedValue(true);

    await announcePointAssigned({
      memberDiscordId: null,
      points: 1,
      scope: "week",
      reason: null,
      bossName: null,
      kill: null,
      weekStart: CURRENT_WEEK,
    });

    expect(dmSpy).not.toHaveBeenCalled();
  });

  it("semana futura: avisa en futuro y nombra la semana exacta", async () => {
    const dmSpy = vi.spyOn(discordBot, "sendDirectMessage").mockResolvedValue(true);

    await announcePointAssigned({
      memberDiscordId: "999",
      points: 1,
      scope: "week",
      reason: "llegó tarde",
      bossName: null,
      kill: null,
      weekStart: FUTURE_WEEK,
    });

    const embed = dmSpy.mock.calls[0][2];
    expect(embed!.title).toBe("Punto programado");
    expect(embed!.description).toContain("Vas a tener");
    expect(embed!.description).toContain("semana del");
    expect(embed!.description).toContain("llegó tarde");
    expect(embed!.description).not.toContain("Se te cargó");
  });
});
