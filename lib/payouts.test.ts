import { describe, expect, it } from "vitest";
import {
  createPayoutBatch,
  deletePayoutBatch,
  getPayoutCandidatesForRuns,
  getUnpaidRuns,
  hasAnyPaidCuts,
  markPayoutBatchPaid,
  markPayoutItemPaid,
  unmarkPayoutItemPaid,
} from "@/lib/payouts";
import { createFakeSupabase } from "@/lib/test-utils/fake-supabase";

type FakeSupabase = ReturnType<typeof createFakeSupabase>;

function asClient(fake: FakeSupabase) {
  return fake as unknown as Parameters<typeof createPayoutBatch>[0];
}

function serviceRow(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    description: `Run ${id}`,
    total_price: 200,
    currency: "USD",
    sold_date: "2026-01-01",
    fully_paid: false,
    paid_at: null,
    adv_user_id: null,
    adv_cut_percent: 20,
    created_by: null,
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function cutRow(id: string, serviceId: string, userId: string | null, amount: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    service_id: serviceId,
    user_id: userId,
    freelance_name: userId ? null : "Freelance",
    freelancer_id: null,
    cut_percent: 100,
    cut_amount: amount,
    paid: false,
    paid_date: null,
    ...overrides,
  };
}

function userRow(id: string, discordUsername: string, binanceId: string | null = "uid-123") {
  return { id, discord_username: discordUsername, nickname: null, binance_id: binanceId, app_role: "member" };
}

function freelancerRow(id: string, name: string, binanceId: string | null = "buid-freelance") {
  return { id, name, binance_id: binanceId, created_by: null };
}

function discountRow(id: string, userId: string, amount: number, overrides: Record<string, unknown> = {}) {
  return { id, user_id: userId, amount, reason: null, reverted: false, reverted_at: null, created_by: null, ...overrides };
}

describe("hasAnyPaidCuts", () => {
  it("true si al menos un cut de la run ya está pagado", async () => {
    const fake = createFakeSupabase({
      service_cuts: [cutRow("cut-1", "run-a", "u1", 100, { paid: true }), cutRow("cut-2", "run-a", "u2", 50)],
    });

    expect(await hasAnyPaidCuts(asClient(fake), "run-a")).toBe(true);
  });

  it("false si ningún cut de la run está pagado todavía", async () => {
    const fake = createFakeSupabase({
      service_cuts: [cutRow("cut-1", "run-a", "u1", 100), cutRow("cut-2", "run-a", "u2", 50)],
    });

    expect(await hasAnyPaidCuts(asClient(fake), "run-a")).toBe(false);
  });

  it("false si la run no tiene ningún cut", async () => {
    const fake = createFakeSupabase({ service_cuts: [] });
    expect(await hasAnyPaidCuts(asClient(fake), "run-a")).toBe(false);
  });
});

describe("getUnpaidRuns", () => {
  it("solo trae runs con al menos un cut de MIEMBRO sin pagar", async () => {
    const fake = createFakeSupabase({
      services_sold: [
        serviceRow("run-pendiente"),
        serviceRow("run-ya-completa", { fully_paid: true }),
        serviceRow("run-cuts-ya-pagados"),
        serviceRow("run-solo-freelance"),
      ],
      service_cuts: [
        cutRow("cut-1", "run-pendiente", "u1", 100),
        cutRow("cut-2", "run-ya-completa", "u1", 100),
        cutRow("cut-3", "run-cuts-ya-pagados", "u1", 100, { paid: true }),
        cutRow("cut-4", "run-solo-freelance", null, 100),
      ],
      app_users: [userRow("u1", "Booster1")],
    });

    const runs = await getUnpaidRuns(asClient(fake));

    expect(runs.map((r) => r.id)).toEqual(["run-pendiente"]);
    expect(runs[0].pendingAmount).toBe(100);
  });
});

describe("getPayoutCandidatesForRuns", () => {
  it("agrupa por booster SOLO dentro de las runs pedidas, sumando sus cuts", async () => {
    const fake = createFakeSupabase({
      service_cuts: [
        cutRow("cut-1", "run-a", "u1", 100),
        cutRow("cut-2", "run-a", "u2", 50),
        cutRow("cut-3", "run-b", "u1", 30),
        cutRow("cut-4", "run-c", "u1", 999),
      ],
      app_users: [userRow("u1", "Booster1"), userRow("u2", "Booster2", null)],
      payout_batch_items: [],
    });

    const candidates = await getPayoutCandidatesForRuns(asClient(fake), ["run-a", "run-b"]);

    const u1 = candidates.find((c) => c.userId === "u1")!;
    expect(u1.pendingAmount).toBe(130);
    expect(u1.serviceCutIds.sort()).toEqual(["cut-1", "cut-3"]);

    const u2 = candidates.find((c) => c.userId === "u2")!;
    expect(u2.pendingAmount).toBe(50);
    expect(u2.binanceId).toBeNull();
  });

  it("EXCLUYE un cut ya reservado por otro lote pendiente -- no se ofrece dos veces", async () => {
    const fake = createFakeSupabase({
      service_cuts: [cutRow("cut-1", "run-a", "u1", 100), cutRow("cut-2", "run-a", "u1", 40)],
      app_users: [userRow("u1", "Booster1")],
      payout_batch_items: [
        { id: "item-x", batch_id: "batch-x", user_id: "u1", status: "pending", service_cut_ids: ["cut-1"] },
      ],
    });

    const [candidate] = await getPayoutCandidatesForRuns(asClient(fake), ["run-a"]);
    expect(candidate.hasOpenBatch).toBe(true);
    expect(candidate.pendingAmount).toBe(40);
    expect(candidate.serviceCutIds).toEqual(["cut-2"]);
  });

  it("un booster con TODOS sus cuts reservados no aparece como candidato", async () => {
    const fake = createFakeSupabase({
      service_cuts: [cutRow("cut-1", "run-a", "u1", 100)],
      app_users: [userRow("u1", "Booster1")],
      payout_batch_items: [
        { id: "item-x", batch_id: "batch-x", user_id: "u1", status: "pending", service_cut_ids: ["cut-1"] },
      ],
    });

    const candidates = await getPayoutCandidatesForRuns(asClient(fake), ["run-a"]);
    expect(candidates).toHaveLength(0);
  });

  it("incluye un freelancer guardado como candidato, con su propio Binance ID", async () => {
    const fake = createFakeSupabase({
      service_cuts: [
        cutRow("cut-1", "run-a", "u1", 100),
        cutRow("cut-2", "run-a", null, 40, { freelancer_id: "f1" }),
      ],
      app_users: [userRow("u1", "Booster1")],
      freelancers: [freelancerRow("f1", "Juan Freelance", "buid-juan")],
      payout_batch_items: [],
    });

    const candidates = await getPayoutCandidatesForRuns(asClient(fake), ["run-a"]);

    const freelancer = candidates.find((c) => c.freelancerId === "f1")!;
    expect(freelancer.isFreelance).toBe(true);
    expect(freelancer.displayName).toBe("Juan Freelance");
    expect(freelancer.binanceId).toBe("buid-juan");
    expect(freelancer.pendingAmount).toBe(40);
    expect(freelancer.userId).toBeNull();
  });

  it("NO genera candidato para un cut Freelance sin freelancer_id guardado", async () => {
    const fake = createFakeSupabase({
      service_cuts: [cutRow("cut-1", "run-a", null, 40)],
      freelancers: [],
      payout_batch_items: [],
    });

    const candidates = await getPayoutCandidatesForRuns(asClient(fake), ["run-a"]);
    expect(candidates).toHaveLength(0);
  });

  it("descuenta el Descuento de Runs OB activo del monto a pagar (queda neto, con discountApplied expuesto)", async () => {
    const fake = createFakeSupabase({
      service_cuts: [cutRow("cut-1", "run-a", "u1", 100)],
      app_users: [userRow("u1", "Booster1")],
      ob_discounts: [discountRow("d1", "u1", 30)],
      payout_batch_items: [],
    });

    const [candidate] = await getPayoutCandidatesForRuns(asClient(fake), ["run-a"]);
    expect(candidate.pendingAmount).toBe(70);
    expect(candidate.discountApplied).toBe(30);
  });

  it("topea el descuento aplicado al monto pendiente (no lo deja negativo)", async () => {
    const fake = createFakeSupabase({
      service_cuts: [cutRow("cut-1", "run-a", "u1", 20)],
      app_users: [userRow("u1", "Booster1")],
      ob_discounts: [discountRow("d1", "u1", 100)],
      payout_batch_items: [],
    });

    const [candidate] = await getPayoutCandidatesForRuns(asClient(fake), ["run-a"]);
    expect(candidate.pendingAmount).toBe(0);
    expect(candidate.discountApplied).toBe(20);
  });

  it("un descuento YA reclamado por otro ítem de lote no se vuelve a ofrecer", async () => {
    const fake = createFakeSupabase({
      service_cuts: [cutRow("cut-1", "run-a", "u1", 50)],
      app_users: [userRow("u1", "Booster1")],
      ob_discounts: [discountRow("d1", "u1", 30)],
      payout_batch_items: [
        { id: "item-x", batch_id: "batch-x", user_id: "u1", status: "pending", service_cut_ids: [], discount_applied: 30 },
      ],
    });

    const [candidate] = await getPayoutCandidatesForRuns(asClient(fake), ["run-a"]);
    expect(candidate.discountApplied).toBe(0);
    expect(candidate.pendingAmount).toBe(50);
  });

  it("suma varios cuts sin arrastrar ruido de coma flotante (bug real: 0.1 + 0.2 = 0.30000000000000004 en JS)", async () => {
    const fake = createFakeSupabase({
      service_cuts: [cutRow("cut-1", "run-a", "u1", 0.1), cutRow("cut-2", "run-a", "u1", 0.2)],
      app_users: [userRow("u1", "Booster1")],
      payout_batch_items: [],
    });

    const [candidate] = await getPayoutCandidatesForRuns(asClient(fake), ["run-a"]);
    expect(candidate.pendingAmount).toBe(0.3);
  });

  it("un freelancer nunca recibe descuento aplicado, aunque exista un ob_discounts con el mismo id por error", async () => {
    const fake = createFakeSupabase({
      service_cuts: [cutRow("cut-1", "run-a", null, 40, { freelancer_id: "f1" })],
      freelancers: [freelancerRow("f1", "Juan Freelance")],
      ob_discounts: [discountRow("d1", "f1", 999)],
      payout_batch_items: [],
    });

    const [candidate] = await getPayoutCandidatesForRuns(asClient(fake), ["run-a"]);
    expect(candidate.discountApplied).toBe(0);
    expect(candidate.pendingAmount).toBe(40);
  });
});

describe("createPayoutBatch", () => {
  it("rechaza el lote si el booster no tiene Binance ID", async () => {
    const fake = createFakeSupabase({
      app_users: [userRow("u1", "SinBinance", null)],
      service_cuts: [cutRow("cut-1", "run-a", "u1", 100)],
      payout_batches: [],
      payout_batch_items: [],
    });

    await expect(
      createPayoutBatch(asClient(fake), { currency: "USDT", note: null, items: [{ userId: "u1", freelancerId: null, serviceCutIds: ["cut-1"] }] }, "admin-1")
    ).rejects.toThrow(/SinBinance no tiene Binance ID cargado/);

    expect(fake._tables.payout_batches).toHaveLength(0);
  });

  it("rechaza si alguno de los cuts pedidos ya está pagado", async () => {
    const fake = createFakeSupabase({
      app_users: [userRow("u1", "Booster1")],
      service_cuts: [cutRow("cut-1", "run-a", "u1", 100, { paid: true })],
      payout_batches: [],
      payout_batch_items: [],
    });

    await expect(
      createPayoutBatch(asClient(fake), { currency: "USDT", note: null, items: [{ userId: "u1", freelancerId: null, serviceCutIds: ["cut-1"] }] }, "admin-1")
    ).rejects.toThrow(/ya tiene esa run pagada/);
  });

  it("rechaza si un cut ya está reservado por OTRO lote pendiente (backstop server-side)", async () => {
    const fake = createFakeSupabase({
      app_users: [userRow("u1", "Booster1")],
      service_cuts: [cutRow("cut-1", "run-a", "u1", 100)],
      payout_batches: [],
      payout_batch_items: [
        { id: "item-otro", batch_id: "batch-otro", user_id: "u1", status: "pending", service_cut_ids: ["cut-1"] },
      ],
    });

    await expect(
      createPayoutBatch(asClient(fake), { currency: "USDT", note: null, items: [{ userId: "u1", freelancerId: null, serviceCutIds: ["cut-1"] }] }, "admin-1")
    ).rejects.toThrow(/ya está en otro lote sin confirmar/);

    expect(fake._tables.payout_batches).toHaveLength(0);
  });

  it("rechaza un cut repetido dentro del mismo lote (mismo id dos veces)", async () => {
    const fake = createFakeSupabase({
      app_users: [userRow("u1", "Booster1")],
      service_cuts: [cutRow("cut-1", "run-a", "u1", 100)],
      payout_batches: [],
      payout_batch_items: [],
    });

    await expect(
      createPayoutBatch(
        asClient(fake),
        { currency: "USDT", note: null, items: [{ userId: "u1", freelancerId: null, serviceCutIds: ["cut-1", "cut-1"] }] },
        "admin-1"
      )
    ).rejects.toThrow(/repetida/);
  });

  it("calcula el monto SIEMPRE desde los cuts reales, sumando varias runs", async () => {
    const fake = createFakeSupabase({
      app_users: [userRow("u1", "Booster1")],
      service_cuts: [cutRow("cut-1", "run-a", "u1", 100), cutRow("cut-2", "run-b", "u1", 30)],
      payout_batches: [],
      payout_batch_items: [],
    });

    const batch = await createPayoutBatch(
      asClient(fake),
      { currency: "USDT", note: "primer lote", items: [{ userId: "u1", freelancerId: null, serviceCutIds: ["cut-1", "cut-2"] }] },
      "admin-1"
    );

    expect(batch.items).toHaveLength(1);
    expect(batch.items[0].amount).toBe(130);
    expect(batch.items[0].serviceCutIds.sort()).toEqual(["cut-1", "cut-2"]);
    expect(batch.status).toBe("pending");
  });

  it("arma un ítem para un freelancer guardado igual que para un miembro", async () => {
    const fake = createFakeSupabase({
      freelancers: [freelancerRow("f1", "Juan Freelance", "buid-juan")],
      service_cuts: [cutRow("cut-1", "run-a", null, 40, { freelancer_id: "f1" })],
      payout_batches: [],
      payout_batch_items: [],
    });

    const batch = await createPayoutBatch(
      asClient(fake),
      { currency: "USDT", note: null, items: [{ userId: null, freelancerId: "f1", serviceCutIds: ["cut-1"] }] },
      "admin-1"
    );

    expect(batch.items).toHaveLength(1);
    expect(batch.items[0].amount).toBe(40);
    expect(batch.items[0].binanceId).toBe("buid-juan");
    expect(batch.items[0].isFreelance).toBe(true);
    expect(batch.items[0].freelancerId).toBe("f1");
  });

  it("rechaza el lote si el freelancer no tiene Binance ID", async () => {
    const fake = createFakeSupabase({
      freelancers: [freelancerRow("f1", "SinBinance", null)],
      service_cuts: [cutRow("cut-1", "run-a", null, 40, { freelancer_id: "f1" })],
      payout_batches: [],
      payout_batch_items: [],
    });

    await expect(
      createPayoutBatch(
        asClient(fake),
        { currency: "USDT", note: null, items: [{ userId: null, freelancerId: "f1", serviceCutIds: ["cut-1"] }] },
        "admin-1"
      )
    ).rejects.toThrow(/SinBinance no tiene Binance ID cargado/);
  });

  it("rechaza un ítem sin userId NI freelancerId", async () => {
    const fake = createFakeSupabase({ service_cuts: [], payout_batches: [], payout_batch_items: [] });

    await expect(
      createPayoutBatch(
        asClient(fake),
        { currency: "USDT", note: null, items: [{ userId: null, freelancerId: null, serviceCutIds: ["cut-1"] }] },
        "admin-1"
      )
    ).rejects.toThrow(/exactamente un miembro o un freelancer/);
  });

  it("el monto final nunca arrastra ruido de coma flotante (bug real reportado: Binance rechazaba el CSV por decimales de más)", async () => {
    const fake = createFakeSupabase({
      app_users: [userRow("u1", "Booster1")],
      service_cuts: [cutRow("cut-1", "run-a", "u1", 0.1), cutRow("cut-2", "run-b", "u1", 0.2)],
      payout_batches: [],
      payout_batch_items: [],
    });

    const batch = await createPayoutBatch(
      asClient(fake),
      { currency: "USDT", note: null, items: [{ userId: "u1", freelancerId: null, serviceCutIds: ["cut-1", "cut-2"] }] },
      "admin-1"
    );

    expect(batch.items[0].amount).toBe(0.3);
    expect(batch.items[0].amount.toString()).toBe("0.3");
  });

  it("recorta el monto por el Descuento de Runs OB activo y guarda discount_applied", async () => {
    const fake = createFakeSupabase({
      app_users: [userRow("u1", "Booster1")],
      service_cuts: [cutRow("cut-1", "run-a", "u1", 100)],
      ob_discounts: [discountRow("d1", "u1", 30)],
      payout_batches: [],
      payout_batch_items: [],
    });

    const batch = await createPayoutBatch(
      asClient(fake),
      { currency: "USDT", note: null, items: [{ userId: "u1", freelancerId: null, serviceCutIds: ["cut-1"] }] },
      "admin-1"
    );

    expect(batch.items[0].amount).toBe(70);
    expect(batch.items[0].discountApplied).toBe(30);
  });

  it("un descuento que cubre el 100% del monto deja el ítem en $0, sin rechazar el lote", async () => {
    const fake = createFakeSupabase({
      app_users: [userRow("u1", "Booster1")],
      service_cuts: [cutRow("cut-1", "run-a", "u1", 20)],
      ob_discounts: [discountRow("d1", "u1", 50)],
      payout_batches: [],
      payout_batch_items: [],
    });

    const batch = await createPayoutBatch(
      asClient(fake),
      { currency: "USDT", note: null, items: [{ userId: "u1", freelancerId: null, serviceCutIds: ["cut-1"] }] },
      "admin-1"
    );

    expect(batch.items[0].amount).toBe(0);
    expect(batch.items[0].discountApplied).toBe(20);
  });

  it("NO aplica descuento a un ítem de freelancer", async () => {
    const fake = createFakeSupabase({
      freelancers: [freelancerRow("f1", "Juan Freelance", "buid-juan")],
      service_cuts: [cutRow("cut-1", "run-a", null, 40, { freelancer_id: "f1" })],
      ob_discounts: [discountRow("d1", "f1", 999)],
      payout_batches: [],
      payout_batch_items: [],
    });

    const batch = await createPayoutBatch(
      asClient(fake),
      { currency: "USDT", note: null, items: [{ userId: null, freelancerId: "f1", serviceCutIds: ["cut-1"] }] },
      "admin-1"
    );

    expect(batch.items[0].amount).toBe(40);
    expect(batch.items[0].discountApplied).toBe(0);
  });

  it("un descuento ya reclamado por un lote anterior NO se vuelve a aplicar en un lote nuevo (dinero real: nunca se descuenta dos veces)", async () => {
    const fake = createFakeSupabase({
      app_users: [userRow("u1", "Booster1")],
      service_cuts: [cutRow("cut-1", "run-a", "u1", 50), cutRow("cut-2", "run-b", "u1", 50)],
      ob_discounts: [discountRow("d1", "u1", 30)],
      payout_batches: [],
      payout_batch_items: [],
    });

    const batch1 = await createPayoutBatch(
      asClient(fake),
      { currency: "USDT", note: null, items: [{ userId: "u1", freelancerId: null, serviceCutIds: ["cut-1"] }] },
      "admin-1"
    );
    expect(batch1.items[0].amount).toBe(20);
    expect(batch1.items[0].discountApplied).toBe(30);

    const batch2 = await createPayoutBatch(
      asClient(fake),
      { currency: "USDT", note: null, items: [{ userId: "u1", freelancerId: null, serviceCutIds: ["cut-2"] }] },
      "admin-1"
    );
    expect(batch2.items[0].amount).toBe(50);
    expect(batch2.items[0].discountApplied).toBe(0);
  });

  it("borrar un lote pendiente libera de vuelta el descuento que había reclamado", async () => {
    const fake = createFakeSupabase({
      app_users: [userRow("u1", "Booster1")],
      service_cuts: [cutRow("cut-1", "run-a", "u1", 50), cutRow("cut-2", "run-b", "u1", 50)],
      ob_discounts: [discountRow("d1", "u1", 30)],
      payout_batches: [],
      payout_batch_items: [],
    });

    const batch1 = await createPayoutBatch(
      asClient(fake),
      { currency: "USDT", note: null, items: [{ userId: "u1", freelancerId: null, serviceCutIds: ["cut-1"] }] },
      "admin-1"
    );
    expect(batch1.items[0].discountApplied).toBe(30);

    await deletePayoutBatch(asClient(fake), batch1.id);

    const batch2 = await createPayoutBatch(
      asClient(fake),
      { currency: "USDT", note: null, items: [{ userId: "u1", freelancerId: null, serviceCutIds: ["cut-2"] }] },
      "admin-1"
    );
    expect(batch2.items[0].amount).toBe(20);
    expect(batch2.items[0].discountApplied).toBe(30);
  });
});

describe("markPayoutItemPaid", () => {
  it("marca los cuts pagados y completa la run SOLO cuando TODOS sus cuts de miembro ya cobraron", async () => {
    const fake = createFakeSupabase({
      services_sold: [serviceRow("run-a")],
      service_cuts: [cutRow("cut-1", "run-a", "u1", 100), cutRow("cut-2", "run-a", "u2", 100)],
      app_users: [userRow("u1", "Booster1"), userRow("u2", "Booster2")],
      payout_batches: [{ id: "batch-1", currency: "USDT", note: null, created_by: null, created_at: "2026-01-01" }],
      payout_batch_items: [
        {
          id: "item-u1",
          batch_id: "batch-1",
          user_id: "u1",
          discord_username: "Booster1",
          binance_id: "uid-123",
          amount: 100,
          service_cut_ids: ["cut-1"],
          status: "pending",
          tx_reference: null,
          paid_at: null,
          paid_by: null,
        },
        {
          id: "item-u2",
          batch_id: "batch-1",
          user_id: "u2",
          discord_username: "Booster2",
          binance_id: "uid-456",
          amount: 100,
          service_cut_ids: ["cut-2"],
          status: "pending",
          tx_reference: null,
          paid_at: null,
          paid_by: null,
        },
      ],
    });

    await markPayoutItemPaid(asClient(fake), "item-u1", { txReference: "tx-1", paidBy: "admin-1" });

    let run = (fake._tables.services_sold as Array<Record<string, unknown>>).find((s) => s.id === "run-a")!;
    expect(run.fully_paid).toBe(false);

    const cut1 = (fake._tables.service_cuts as Array<Record<string, unknown>>).find((c) => c.id === "cut-1")!;
    expect(cut1.paid).toBe(true);

    const notifs = fake._tables.notifications as Array<Record<string, unknown>>;
    expect(notifs.some((n) => n.user_id === "u1" && n.type === "payment")).toBe(true);

    await markPayoutItemPaid(asClient(fake), "item-u2", { txReference: "tx-1", paidBy: "admin-1" });

    run = (fake._tables.services_sold as Array<Record<string, unknown>>).find((s) => s.id === "run-a")!;
    expect(run.fully_paid).toBe(true);
    expect(run.paid_at).toBeTruthy();
  });

  it("ignora cuts Freelance al decidir si una run está completa", async () => {
    const fake = createFakeSupabase({
      services_sold: [serviceRow("run-a")],
      service_cuts: [cutRow("cut-1", "run-a", "u1", 100), cutRow("cut-freelance", "run-a", null, 50)],
      app_users: [userRow("u1", "Booster1")],
      payout_batches: [{ id: "batch-1", currency: "USDT", note: null, created_by: null, created_at: "2026-01-01" }],
      payout_batch_items: [
        {
          id: "item-u1",
          batch_id: "batch-1",
          user_id: "u1",
          discord_username: "Booster1",
          binance_id: "uid-123",
          amount: 100,
          service_cut_ids: ["cut-1"],
          status: "pending",
          tx_reference: null,
          paid_at: null,
          paid_by: null,
        },
      ],
    });

    await markPayoutItemPaid(asClient(fake), "item-u1", { txReference: null, paidBy: "admin-1" });

    const run = (fake._tables.services_sold as Array<Record<string, unknown>>).find((s) => s.id === "run-a")!;
    expect(run.fully_paid).toBe(true);
  });

  it("un cut Freelance CON freelancer_id guardado SÍ bloquea/completa la run, igual que un miembro", async () => {
    const fake = createFakeSupabase({
      services_sold: [serviceRow("run-a")],
      service_cuts: [
        cutRow("cut-1", "run-a", "u1", 100),
        cutRow("cut-freelance", "run-a", null, 50, { freelancer_id: "f1" }),
      ],
      app_users: [userRow("u1", "Booster1")],
      freelancers: [freelancerRow("f1", "Juan Freelance")],
      payout_batches: [{ id: "batch-1", currency: "USDT", note: null, created_by: null, created_at: "2026-01-01" }],
      payout_batch_items: [
        {
          id: "item-u1",
          batch_id: "batch-1",
          user_id: "u1",
          freelancer_id: null,
          discord_username: "Booster1",
          binance_id: "uid-123",
          amount: 100,
          service_cut_ids: ["cut-1"],
          status: "pending",
          tx_reference: null,
          paid_at: null,
          paid_by: null,
        },
        {
          id: "item-f1",
          batch_id: "batch-1",
          user_id: null,
          freelancer_id: "f1",
          discord_username: "Juan Freelance",
          binance_id: "buid-freelance",
          amount: 50,
          service_cut_ids: ["cut-freelance"],
          status: "pending",
          tx_reference: null,
          paid_at: null,
          paid_by: null,
        },
      ],
    });

    await markPayoutItemPaid(asClient(fake), "item-u1", { txReference: null, paidBy: "admin-1" });
    let run = (fake._tables.services_sold as Array<Record<string, unknown>>).find((s) => s.id === "run-a")!;
    expect(run.fully_paid).toBe(false);

    await markPayoutItemPaid(asClient(fake), "item-f1", { txReference: null, paidBy: "admin-1" });
    run = (fake._tables.services_sold as Array<Record<string, unknown>>).find((s) => s.id === "run-a")!;
    expect(run.fully_paid).toBe(true);

    const freelanceCut = (fake._tables.service_cuts as Array<Record<string, unknown>>).find((c) => c.id === "cut-freelance")!;
    expect(freelanceCut.paid).toBe(true);
  });

  it("no reprocesa un ítem que ya estaba pagado", async () => {
    const fake = createFakeSupabase({
      services_sold: [serviceRow("run-a", { fully_paid: true, paid_at: "2026-01-02T00:00:00.000Z" })],
      service_cuts: [cutRow("cut-1", "run-a", "u1", 100, { paid: true, paid_date: "2026-01-02" })],
      payout_batches: [{ id: "batch-1", currency: "USDT", note: null, created_by: null, created_at: "2026-01-01" }],
      payout_batch_items: [
        {
          id: "item-u1",
          batch_id: "batch-1",
          user_id: "u1",
          discord_username: "Booster1",
          binance_id: "uid-123",
          amount: 100,
          service_cut_ids: ["cut-1"],
          status: "paid",
          tx_reference: "tx-original",
          paid_at: "2026-01-02T00:00:00.000Z",
          paid_by: "admin-1",
        },
      ],
    });

    const result = await markPayoutItemPaid(asClient(fake), "item-u1", { txReference: "tx-nuevo", paidBy: "admin-2" });
    expect(result.txReference).toBe("tx-original");
  });

  it("manda UNA sola notificación con el total, aunque el ítem cubra varias runs", async () => {
    const fake = createFakeSupabase({
      services_sold: [serviceRow("run-a"), serviceRow("run-b"), serviceRow("run-c")],
      service_cuts: [
        cutRow("cut-a", "run-a", "u1", 30.5),
        cutRow("cut-b", "run-b", "u1", 20.25),
        cutRow("cut-c", "run-c", "u1", 10.1),
      ],
      app_users: [userRow("u1", "Booster1")],
      payout_batches: [{ id: "batch-1", currency: "USDT", note: null, created_by: null, created_at: "2026-01-01" }],
      payout_batch_items: [
        {
          id: "item-u1",
          batch_id: "batch-1",
          user_id: "u1",
          discord_username: "Booster1",
          binance_id: "uid-123",
          amount: 60.85,
          service_cut_ids: ["cut-a", "cut-b", "cut-c"],
          status: "pending",
          tx_reference: null,
          paid_at: null,
          paid_by: null,
        },
      ],
    });

    await markPayoutItemPaid(asClient(fake), "item-u1", { txReference: "tx-1", paidBy: "admin-1" });

    const notifs = (fake._tables.notifications as Array<Record<string, unknown>>).filter(
      (n) => n.user_id === "u1"
    );
    expect(notifs).toHaveLength(1);
    expect(notifs[0].type).toBe("payment");
    expect(notifs[0].message).toContain("3 runs");
    expect(notifs[0].message).toContain("$60.85");
  });

  it("dice '1 run' en singular cuando el ítem cubre una sola", async () => {
    const fake = createFakeSupabase({
      services_sold: [serviceRow("run-a")],
      service_cuts: [cutRow("cut-a", "run-a", "u1", 42)],
      app_users: [userRow("u1", "Booster1")],
      payout_batches: [{ id: "batch-1", currency: "USDT", note: null, created_by: null, created_at: "2026-01-01" }],
      payout_batch_items: [
        {
          id: "item-u1",
          batch_id: "batch-1",
          user_id: "u1",
          discord_username: "Booster1",
          binance_id: "uid-123",
          amount: 42,
          service_cut_ids: ["cut-a"],
          status: "pending",
          tx_reference: null,
          paid_at: null,
          paid_by: null,
        },
      ],
    });

    await markPayoutItemPaid(asClient(fake), "item-u1", { txReference: null, paidBy: "admin-1" });

    const notifs = (fake._tables.notifications as Array<Record<string, unknown>>).filter(
      (n) => n.user_id === "u1"
    );
    expect(notifs).toHaveLength(1);
    expect(notifs[0].message).toBe("Se te pagó $42.00 por 1 run OB.");
  });
});

describe("unmarkPayoutItemPaid", () => {
  it("revierte el cut a sin pagar y REABRE la run si había quedado fully_paid gracias a este pago", async () => {
    const fake = createFakeSupabase({
      services_sold: [serviceRow("run-a", { fully_paid: true, paid_at: "2026-01-02T00:00:00.000Z" })],
      service_cuts: [cutRow("cut-1", "run-a", "u1", 100, { paid: true, paid_date: "2026-01-02" })],
      payout_batches: [{ id: "batch-1", currency: "USDT", note: null, created_by: null, created_at: "2026-01-01" }],
      payout_batch_items: [
        {
          id: "item-u1",
          batch_id: "batch-1",
          user_id: "u1",
          discord_username: "Booster1",
          binance_id: "uid-123",
          amount: 100,
          service_cut_ids: ["cut-1"],
          status: "paid",
          tx_reference: "tx-1",
          paid_at: "2026-01-02T00:00:00.000Z",
          paid_by: "admin-1",
        },
      ],
    });

    const result = await unmarkPayoutItemPaid(asClient(fake), "item-u1");

    expect(result.status).toBe("pending");
    expect(result.paidAt).toBeNull();

    const cut1 = (fake._tables.service_cuts as Array<Record<string, unknown>>).find((c) => c.id === "cut-1")!;
    expect(cut1.paid).toBe(false);

    const run = (fake._tables.services_sold as Array<Record<string, unknown>>).find((s) => s.id === "run-a")!;
    expect(run.fully_paid).toBe(false);
    expect(run.paid_at).toBeNull();
  });

  it("no hace nada si el ítem ya estaba pending", async () => {
    const fake = createFakeSupabase({
      payout_batch_items: [
        {
          id: "item-1",
          batch_id: "batch-1",
          user_id: "u1",
          discord_username: "Booster1",
          binance_id: "uid-123",
          amount: 100,
          service_cut_ids: [],
          status: "pending",
          tx_reference: null,
          paid_at: null,
          paid_by: null,
        },
      ],
    });

    const result = await unmarkPayoutItemPaid(asClient(fake), "item-1");
    expect(result.status).toBe("pending");
  });
});

describe("markPayoutBatchPaid", () => {
  it("solo afecta los ítems pending del lote, no reprocesa los ya pagados", async () => {
    const fake = createFakeSupabase({
      services_sold: [serviceRow("run-a")],
      service_cuts: [cutRow("cut-1", "run-a", "u1", 20)],
      app_users: [userRow("u1", "Pendiente")],
      payout_batches: [{ id: "batch-x", currency: "USDT", note: null, created_by: null, created_at: "2026-01-01" }],
      payout_batch_items: [
        {
          id: "item-a",
          batch_id: "batch-x",
          user_id: "u1",
          discord_username: "Pendiente",
          binance_id: "uid-a",
          amount: 20,
          service_cut_ids: ["cut-1"],
          status: "pending",
          tx_reference: null,
          paid_at: null,
          paid_by: null,
        },
        {
          id: "item-b",
          batch_id: "batch-x",
          user_id: "u2",
          discord_username: "YaPagado",
          binance_id: "uid-b",
          amount: 30,
          service_cut_ids: [],
          status: "paid",
          tx_reference: "tx-viejo",
          paid_at: "2026-01-02T00:00:00.000Z",
          paid_by: "admin-1",
        },
      ],
    });

    const results = await markPayoutBatchPaid(asClient(fake), "batch-x", { txReference: "tx-lote", paidBy: "admin-2" });

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("item-a");
    expect(results[0].txReference).toBe("tx-lote");

    const itemB = (fake._tables.payout_batch_items as Array<Record<string, unknown>>).find((r) => r.id === "item-b")!;
    expect(itemB.tx_reference).toBe("tx-viejo");
  });
});

describe("deletePayoutBatch", () => {
  it("elimina el lote cuando NINGÚN ítem está pagado todavía", async () => {
    const fake = createFakeSupabase({
      payout_batches: [{ id: "batch-1", currency: "USDT", note: null, created_by: null, created_at: "2026-01-01" }],
      payout_batch_items: [
        {
          id: "item-1",
          batch_id: "batch-1",
          user_id: "u1",
          discord_username: "Booster1",
          binance_id: "uid-123",
          amount: 100,
          service_cut_ids: ["cut-1"],
          status: "pending",
          tx_reference: null,
          paid_at: null,
          paid_by: null,
        },
      ],
    });

    await deletePayoutBatch(asClient(fake), "batch-1");
    expect(fake._tables.payout_batches).toHaveLength(0);
  });

  it("rechaza eliminar un lote con algún ítem ya pagado", async () => {
    const fake = createFakeSupabase({
      payout_batches: [{ id: "batch-1", currency: "USDT", note: null, created_by: null, created_at: "2026-01-01" }],
      payout_batch_items: [
        {
          id: "item-1",
          batch_id: "batch-1",
          user_id: "u1",
          discord_username: "Booster1",
          binance_id: "uid-123",
          amount: 100,
          service_cut_ids: ["cut-1"],
          status: "paid",
          tx_reference: "tx-1",
          paid_at: "2026-01-02T00:00:00.000Z",
          paid_by: "admin-1",
        },
      ],
    });

    await expect(deletePayoutBatch(asClient(fake), "batch-1")).rejects.toThrow(
      "Este lote tiene pagos ya confirmados -- deshazlos primero antes de eliminarlo"
    );
    expect(fake._tables.payout_batches).toHaveLength(1);
  });
});
