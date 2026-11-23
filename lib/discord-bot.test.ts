import { afterEach, describe, expect, it, vi } from "vitest";
import { sendDirectMessage } from "@/lib/discord-bot";

const ORIGINAL = { ...process.env };
afterEach(() => {
  process.env = { ...ORIGINAL };
  vi.restoreAllMocks();
});

describe("discord-bot: sendDirectMessage", () => {
  it("sin DISCORD_BOT_TOKEN no tira excepción, solo avisa y no llama a fetch", async () => {
    delete process.env.DISCORD_BOT_TOKEN;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(sendDirectMessage("123", "hola")).resolves.toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
  });

  it("éxito: abre el canal y manda el mensaje, en ese orden", async () => {
    process.env.DISCORD_BOT_TOKEN = "test-token";
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: "chan-1" }) } as Response)
      .mockResolvedValueOnce({ ok: true, text: async () => "" } as Response);

    const result = await sendDirectMessage("123", "hola", { title: "t", description: "d", color: 0 });

    expect(result).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy.mock.calls[0][0]).toBe("https://discord.com/api/v10/users/@me/channels");
    expect(JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string)).toEqual({
      recipient_id: "123",
    });
    expect(
      ((fetchSpy.mock.calls[0][1] as RequestInit).headers as Record<string, string>).Authorization
    ).toBe("Bot test-token");
    expect(fetchSpy.mock.calls[1][0]).toBe("https://discord.com/api/v10/channels/chan-1/messages");
    expect(JSON.parse((fetchSpy.mock.calls[1][1] as RequestInit).body as string)).toEqual({
      content: "hola",
      embeds: [{ title: "t", description: "d", color: 0 }],
    });
  });

  it("sin embed manda embeds vacío", async () => {
    process.env.DISCORD_BOT_TOKEN = "test-token";
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: "chan-1" }) } as Response)
      .mockResolvedValueOnce({ ok: true, text: async () => "" } as Response);

    await sendDirectMessage("123", "hola");

    expect(JSON.parse((fetchSpy.mock.calls[1][1] as RequestInit).body as string)).toEqual({
      content: "hola",
      embeds: [],
    });
  });

  it("si falla abrir el canal (403, DMs cerrados) devuelve false sin mandar el mensaje", async () => {
    process.env.DISCORD_BOT_TOKEN = "test-token";
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({ ok: false, status: 403, text: async () => "Forbidden" } as Response);

    await expect(sendDirectMessage("123", "hola")).resolves.toBe(false);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("si falla el envío del mensaje devuelve false", async () => {
    process.env.DISCORD_BOT_TOKEN = "test-token";
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: "chan-1" }) } as Response)
      .mockResolvedValueOnce({ ok: false, status: 500, text: async () => "boom" } as Response);

    await expect(sendDirectMessage("123", "hola")).resolves.toBe(false);
  });

  it("si la red se cae, no propaga la excepción", async () => {
    process.env.DISCORD_BOT_TOKEN = "test-token";
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));

    await expect(sendDirectMessage("123", "hola")).resolves.toBe(false);
  });
});
