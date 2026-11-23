import { describe, expect, it } from "vitest";
import { readJson } from "./read-json";

describe("readJson", () => {
  it("parsea un cuerpo JSON normal", async () => {
    const res = new Response(JSON.stringify({ connected: true, candidates: [] }), { status: 200 });
    expect(await readJson<{ connected: boolean }>(res)).toEqual({ connected: true, candidates: [] });
  });

  it("devuelve null con cuerpo vacío en vez de tirar", async () => {
    const res = new Response("", { status: 500 });
    expect(await readJson(res)).toBeNull();
  });

  it("devuelve null con un cuerpo de solo espacios", async () => {
    const res = new Response("   \n  ", { status: 502 });
    expect(await readJson(res)).toBeNull();
  });

  it("devuelve null cuando el cuerpo no es JSON", async () => {
    const res = new Response("<html><body>Gateway Timeout</body></html>", { status: 504 });
    expect(await readJson(res)).toBeNull();
  });

  it("conserva el error del servidor cuando SÍ vino como JSON", async () => {
    const res = new Response(JSON.stringify({ error: "No autenticado" }), { status: 401 });
    expect(await readJson<{ error: string }>(res)).toEqual({ error: "No autenticado" });
  });
});
