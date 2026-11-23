import { describe, expect, it } from "vitest";
import { findOrCreateFreelancer, listFreelancers, resolveFreelancerIdsByName, updateFreelancerBinanceId } from "@/lib/freelancers";
import { createFakeSupabase } from "@/lib/test-utils/fake-supabase";

type FakeSupabase = ReturnType<typeof createFakeSupabase>;

function asClient(fake: FakeSupabase) {
  return fake as unknown as Parameters<typeof findOrCreateFreelancer>[0];
}

describe("findOrCreateFreelancer", () => {
  it("crea un freelancer nuevo si no existe ninguno con ese nombre", async () => {
    const fake = createFakeSupabase({ freelancers: [] });

    const freelancer = await findOrCreateFreelancer(asClient(fake), "Juan Pérez", "admin-1");

    expect(freelancer.name).toBe("Juan Pérez");
    expect(freelancer.binanceId).toBeNull();
    expect(fake._tables.freelancers).toHaveLength(1);
  });

  it("reusa el existente por nombre EXACTO case-insensitive, en vez de duplicar", async () => {
    const fake = createFakeSupabase({
      freelancers: [{ id: "f1", name: "Juan Pérez", binance_id: "buid-1", created_by: null }],
    });

    const freelancer = await findOrCreateFreelancer(asClient(fake), "juan pérez", "admin-1");

    expect(freelancer.id).toBe("f1");
    expect(freelancer.binanceId).toBe("buid-1");
    expect(fake._tables.freelancers).toHaveLength(1);
  });

  it("recorta espacios antes de buscar/crear", async () => {
    const fake = createFakeSupabase({ freelancers: [{ id: "f1", name: "Juan", binance_id: null, created_by: null }] });

    const freelancer = await findOrCreateFreelancer(asClient(fake), "  Juan  ", "admin-1");

    expect(freelancer.id).toBe("f1");
    expect(fake._tables.freelancers).toHaveLength(1);
  });
});

describe("resolveFreelancerIdsByName", () => {
  it("resuelve un id por cada nombre DISTINTO, sin duplicar por nombre repetido", async () => {
    const fake = createFakeSupabase({ freelancers: [] });

    const map = await resolveFreelancerIdsByName(asClient(fake), ["Juan", "Ana", "Juan"], "admin-1");

    expect(map.size).toBe(2);
    expect(map.has("Juan")).toBe(true);
    expect(map.has("Ana")).toBe(true);
    expect(fake._tables.freelancers).toHaveLength(2);
  });

  it("ignora nombres vacíos", async () => {
    const fake = createFakeSupabase({ freelancers: [] });

    const map = await resolveFreelancerIdsByName(asClient(fake), ["  ", "Ana"], "admin-1");

    expect(map.size).toBe(1);
    expect(map.has("Ana")).toBe(true);
  });
});

describe("listFreelancers", () => {
  it("devuelve todos ordenados por nombre", async () => {
    const fake = createFakeSupabase({
      freelancers: [
        { id: "f2", name: "Zoe", binance_id: null, created_by: null },
        { id: "f1", name: "Ana", binance_id: "buid-1", created_by: null },
      ],
    });

    const list = await listFreelancers(asClient(fake));

    expect(list.map((f) => f.name)).toEqual(["Ana", "Zoe"]);
  });
});

describe("updateFreelancerBinanceId", () => {
  it("guarda el Binance ID nuevo", async () => {
    const fake = createFakeSupabase({ freelancers: [{ id: "f1", name: "Ana", binance_id: null, created_by: null }] });

    const updated = await updateFreelancerBinanceId(asClient(fake), "f1", "buid-99");

    expect(updated.binanceId).toBe("buid-99");
  });

  it("recorta espacios y guarda null si queda vacío", async () => {
    const fake = createFakeSupabase({ freelancers: [{ id: "f1", name: "Ana", binance_id: "buid-1", created_by: null }] });

    const updated = await updateFreelancerBinanceId(asClient(fake), "f1", "   ");

    expect(updated.binanceId).toBeNull();
  });

  it("tira error si el freelancer no existe", async () => {
    const fake = createFakeSupabase({ freelancers: [] });

    await expect(updateFreelancerBinanceId(asClient(fake), "no-existe", "buid-1")).rejects.toThrow(
      "Freelancer no encontrado"
    );
  });

  it("rechaza un Binance ID con coma (evita romper el CSV de Pagos)", async () => {
    const fake = createFakeSupabase({ freelancers: [{ id: "f1", name: "Ana", binance_id: null, created_by: null }] });

    await expect(updateFreelancerBinanceId(asClient(fake), "f1", "1234,5678")).rejects.toThrow(/comas/);
  });
});
