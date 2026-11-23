import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  cachedJson,
  clearCache,
  invalidateCache,
  readCache,
  writeCache,
  sameJson,
  setCacheOwner,
  getCacheOwner,

} from "./data-cache";

function mockFetchSequence(responses: unknown[]) {
  let call = 0;
  const spy = vi.fn(async () => {
    const body = responses[Math.min(call, responses.length - 1)];
    call += 1;
    return {
      ok: true,
      text: async () => JSON.stringify(body),
    } as unknown as Response;
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}

describe("data-cache", () => {
  beforeEach(() => {
    clearCache();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("la primera llamada va a la red y guarda el resultado", async () => {
    const spy = mockFetchSequence([{ members: [1, 2] }]);

    const data = await cachedJson<{ members: number[] }>("/api/x");

    expect(data).toEqual({ members: [1, 2] });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(readCache("/api/x")?.data).toEqual({ members: [1, 2] });
  });

  it("una entrada fresca NO vuelve a pegarle a la red", async () => {
    const spy = mockFetchSequence([{ v: 1 }]);

    await cachedJson("/api/x");
    await cachedJson("/api/x");
    await cachedJson("/api/x");

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("dos llamadas simultáneas comparten la misma petición", async () => {
    const spy = mockFetchSequence([{ v: 1 }]);

    const [a, b] = await Promise.all([cachedJson("/api/x"), cachedJson("/api/x")]);

    expect(a).toEqual({ v: 1 });
    expect(b).toEqual({ v: 1 });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("una entrada vieja se devuelve igual y se revalida por detrás", async () => {
    const spy = mockFetchSequence([{ v: 2 }]);
    writeCache("/api/x", { v: 1 });

    const revalidated: unknown[] = [];
    const immediate = await cachedJson("/api/x", { ttlMs: 0, onRevalidated: (d) => revalidated.push(d) });

    expect(immediate).toEqual({ v: 1 });

    await vi.waitFor(() => expect(revalidated).toEqual([{ v: 2 }]));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(readCache("/api/x")?.data).toEqual({ v: 2 });
  });

  it("no avisa de revalidación si los datos no cambiaron", async () => {
    mockFetchSequence([{ v: 1 }]);
    writeCache("/api/x", { v: 1 });

    const revalidated: unknown[] = [];
    await cachedJson("/api/x", { ttlMs: 0, onRevalidated: (d) => revalidated.push(d) });

    await new Promise((r) => setTimeout(r, 30));
    expect(revalidated).toEqual([]);
  });

  it("force ignora lo cacheado", async () => {
    const spy = mockFetchSequence([{ v: 1 }, { v: 2 }]);

    await cachedJson("/api/x");
    const fresh = await cachedJson("/api/x", { force: true });

    expect(fresh).toEqual({ v: 2 });
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("invalidateCache borra por PREFIJO, no solo la URL exacta", async () => {
    writeCache("/api/lockouts", { a: 1 });
    writeCache("/api/lockouts?all=true&vaultIcons=true", { b: 2 });
    writeCache("/api/members", { c: 3 });

    invalidateCache("/api/lockouts");

    expect(readCache("/api/lockouts")).toBeNull();
    expect(readCache("/api/lockouts?all=true&vaultIcons=true")).toBeNull();
    expect(readCache("/api/members")).not.toBeNull();
  });

  it("una respuesta que no es JSON no ensucia la caché", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, text: async () => "<html>error</html>" }) as unknown as Response),
    );

    const data = await cachedJson("/api/x");

    expect(data).toBeNull();
    expect(readCache("/api/x")).toBeNull();
  });

  it("una respuesta con error no se cachea", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, text: async () => "" }) as unknown as Response),
    );

    const data = await cachedJson("/api/x");

    expect(data).toBeNull();
    expect(readCache("/api/x")).toBeNull();
  });
});

describe("dueño de la caché", () => {
  beforeEach(() => {
    clearCache();
    setCacheOwner(null);
  });

  it("cambiar de dueño tira todo lo guardado", () => {
    setCacheOwner("usuario-a");
    writeCache("/api/lockouts", { characters: ["secreto de A"] });
    expect(readCache("/api/lockouts")).not.toBeNull();

    setCacheOwner("usuario-b");

    expect(readCache("/api/lockouts")).toBeNull();
    expect(getCacheOwner()).toBe("usuario-b");
  });

  it("volver a marcar al MISMO dueño no tira nada", () => {
    setCacheOwner("usuario-a");
    writeCache("/api/lockouts", { v: 1 });

    setCacheOwner("usuario-a");
    setCacheOwner("usuario-a");

    expect(readCache("/api/lockouts")?.data).toEqual({ v: 1 });
  });

  it("cerrar sesión (dueño null) también limpia", () => {
    setCacheOwner("usuario-a");
    writeCache("/api/lockouts", { v: 1 });

    setCacheOwner(null);

    expect(readCache("/api/lockouts")).toBeNull();
  });
});

describe("sameJson", () => {
  it("compara por contenido, no por referencia", () => {
    expect(sameJson({ a: [1, 2] }, { a: [1, 2] })).toBe(true);
    expect(sameJson({ a: [1, 2] }, { a: [2, 1] })).toBe(false);
  });

  it("devuelve false ante algo que no se puede serializar", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(sameJson(cyclic, cyclic)).toBe(false);
  });
});
