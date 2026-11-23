import { describe, expect, it } from "vitest";
import {
  applyObDiscount,
  getAllAvailableObDiscountTotalsByUser,
  getAllConfirmedObDiscountTotalsByUser,
  getAvailableObDiscountTotal,
  getConfirmedObDiscountTotal,
  getPendingOBTotal,
  payPartialAdjustment,
  payPartialAdjustmentForAllUsers,
} from "@/lib/balance";
import { createFakeSupabase } from "@/lib/test-utils/fake-supabase";

type FakeSupabase = ReturnType<typeof createFakeSupabase>;

function asClient(fake: FakeSupabase) {
  return fake as unknown as Parameters<typeof payPartialAdjustment>[0];
}

function rowsOf(fake: FakeSupabase) {
  return fake._tables.balance_adjustments as Array<Record<string, unknown>>;
}

function supabaseWith(rows: Array<{ id: string; user_id: string; type: "ib" | "gold"; amount: number; created_at: string }>) {
  return createFakeSupabase({
    balance_adjustments: rows.map((r) => ({ ...r, note: null, paid: false, paid_at: null, created_by: null })),
  });
}

describe("payPartialAdjustment", () => {
  it("parte una fila unica cuando el pago es menor al total pendiente", async () => {
    const fake = supabaseWith([{ id: "row-1", user_id: "u1", type: "gold", amount: 1_000_000, created_at: "2026-01-01" }]);

    const result = await payPartialAdjustment(asClient(fake), "u1", "gold", 600_000, "admin-1");

    expect(result).toEqual({ paidAmount: 600_000, remainingPending: 400_000 });

    const rows = rowsOf(fake);
    expect(rows).toHaveLength(2);
    const original = rows.find((r) => r.id === "row-1")!;
    expect(original.amount).toBe(400_000);
    expect(original.paid).toBe(false);
    const split = rows.find((r) => r.id !== "row-1")!;
    expect(split.amount).toBe(600_000);
    expect(split.paid).toBe(true);
    expect(split.note).toBe("Pago parcial");
  });

  it("consume filas en orden FIFO (mas vieja primero) y solo parte la que hace falta", async () => {
    const fake = supabaseWith([
      { id: "old", user_id: "u1", type: "ib", amount: 200, created_at: "2026-01-01" },
      { id: "new", user_id: "u1", type: "ib", amount: 500, created_at: "2026-01-02" },
    ]);

    const result = await payPartialAdjustment(asClient(fake), "u1", "ib", 300, null);

    expect(result).toEqual({ paidAmount: 300, remainingPending: 400 });

    const rows = rowsOf(fake);
    const old = rows.find((r) => r.id === "old")!;
    expect(old.paid).toBe(true);

    const newRow = rows.find((r) => r.id === "new")!;
    expect(newRow.amount).toBe(400);
    expect(newRow.paid).toBe(false);

    const splitRow = rows.find((r) => r.id !== "old" && r.id !== "new")!;
    expect(splitRow.amount).toBe(100);
    expect(splitRow.paid).toBe(true);
  });

  it("pagar el total pendiente exacto marca todo paid sin partir ninguna fila", async () => {
    const fake = supabaseWith([
      { id: "a", user_id: "u1", type: "gold", amount: 100, created_at: "2026-01-01" },
      { id: "b", user_id: "u1", type: "gold", amount: 50, created_at: "2026-01-02" },
    ]);

    const result = await payPartialAdjustment(asClient(fake), "u1", "gold", 150, null);

    expect(result).toEqual({ paidAmount: 150, remainingPending: 0 });
    const rows = rowsOf(fake);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.paid === true)).toBe(true);
  });

  it("tolera el margen de flotantes (0.005): una fila apenas por encima del monto pedido se paga entera, sin partirla", async () => {
    const fake = supabaseWith([{ id: "row-1", user_id: "u1", type: "gold", amount: 300.004, created_at: "2026-01-01" }]);

    const result = await payPartialAdjustment(asClient(fake), "u1", "gold", 300, null);

    expect(result.remainingPending).toBeCloseTo(0.004, 3);
    const rows = rowsOf(fake);
    expect(rows).toHaveLength(1);
    expect(rows[0].paid).toBe(true);
  });

  it("rechaza pagar mas del total pendiente", async () => {
    const fake = supabaseWith([{ id: "row-1", user_id: "u1", type: "gold", amount: 100, created_at: "2026-01-01" }]);

    await expect(payPartialAdjustment(asClient(fake), "u1", "gold", 200, null)).rejects.toThrow(
      "El monto a pagar no puede superar el balance pendiente"
    );
  });

  it("rechaza montos en cero o negativos", async () => {
    const fake = supabaseWith([{ id: "row-1", user_id: "u1", type: "gold", amount: 100, created_at: "2026-01-01" }]);

    await expect(payPartialAdjustment(asClient(fake), "u1", "gold", 0, null)).rejects.toThrow(
      "El monto a pagar debe ser mayor a cero"
    );
  });
});

describe("payPartialAdjustmentForAllUsers", () => {
  it("paga a cada usuario lo minimo entre el monto parejo y su pendiente, e ignora a quien no debe nada", async () => {
    const fake = createFakeSupabase({
      balance_adjustments: [
        { id: "u1-row", user_id: "u1", type: "ib", amount: 10, paid: false, note: null, paid_at: null, created_by: null, created_at: "2026-01-01" },
        { id: "u2-row", user_id: "u2", type: "ib", amount: 3, paid: false, note: null, paid_at: null, created_by: null, created_at: "2026-01-01" },
      ],
    });

    const result = await payPartialAdjustmentForAllUsers(
      fake as unknown as Parameters<typeof payPartialAdjustmentForAllUsers>[0],
      "ib",
      5,
      "admin-1"
    );

    expect(result.usersAffected).toBe(2);
    expect(result.totalPaid).toBe(8);
  });
});

function supabaseWithPendingOb(userId: string, pendingAmount: number) {
  return createFakeSupabase({
    service_cuts: [{ id: "cut-1", user_id: userId, cut_amount: pendingAmount, paid: false }],
    ob_discounts: [],
  });
}

describe("applyObDiscount", () => {
  it("topea el descuento al pendiente vigente, nunca deja debiendo de más", async () => {
    const fake = supabaseWithPendingOb("u1", 100);

    const result = await applyObDiscount(
      fake as unknown as Parameters<typeof applyObDiscount>[0],
      "u1",
      150,
      "Penalización",
      "admin-1"
    );

    expect(result.discountedAmount).toBe(100);
    expect(result.remainingPending).toBe(0);
    const row = (fake._tables.ob_discounts as Array<Record<string, unknown>>)[0];
    expect(row.amount).toBe(100);
    expect(row.reverted).toBe(false);
  });

  it("rechaza descontar a quien no tiene pendiente", async () => {
    const fake = supabaseWithPendingOb("u1", 0);

    await expect(
      applyObDiscount(fake as unknown as Parameters<typeof applyObDiscount>[0], "u1", 10, null, "admin-1")
    ).rejects.toThrow("Este miembro no tiene saldo de Runs OB pendiente para descontar");
  });
});

describe("getAvailableObDiscountTotal", () => {
  it("sin ningún ítem de Pagos todavía, el disponible es el descuento activo completo", async () => {
    const fake = createFakeSupabase({
      ob_discounts: [{ id: "d1", user_id: "u1", amount: 30, reverted: false }],
      payout_batch_items: [],
    });

    expect(await getAvailableObDiscountTotal(fake as unknown as Parameters<typeof getAvailableObDiscountTotal>[0], "u1")).toBe(30);
  });

  it("resta lo ya reclamado por un ítem de Pagos (pendiente o pagado, da igual)", async () => {
    const fake = createFakeSupabase({
      ob_discounts: [{ id: "d1", user_id: "u1", amount: 30, reverted: false }],
      payout_batch_items: [
        { id: "item-1", user_id: "u1", status: "pending", discount_applied: 10 },
        { id: "item-2", user_id: "u1", status: "paid", discount_applied: 5 },
      ],
    });

    expect(await getAvailableObDiscountTotal(fake as unknown as Parameters<typeof getAvailableObDiscountTotal>[0], "u1")).toBe(15);
  });

  it("nunca da negativo si lo reclamado superó al descuento activo (ej. el descuento se reintegró después)", async () => {
    const fake = createFakeSupabase({
      ob_discounts: [{ id: "d1", user_id: "u1", amount: 10, reverted: false }],
      payout_batch_items: [{ id: "item-1", user_id: "u1", status: "paid", discount_applied: 30 }],
    });

    expect(await getAvailableObDiscountTotal(fake as unknown as Parameters<typeof getAvailableObDiscountTotal>[0], "u1")).toBe(0);
  });

  it("ignora descuentos reintegrados (reverted=true)", async () => {
    const fake = createFakeSupabase({
      ob_discounts: [{ id: "d1", user_id: "u1", amount: 30, reverted: true }],
      payout_batch_items: [],
    });

    expect(await getAvailableObDiscountTotal(fake as unknown as Parameters<typeof getAvailableObDiscountTotal>[0], "u1")).toBe(0);
  });
});

describe("getAllAvailableObDiscountTotalsByUser", () => {
  it("calcula el disponible de varios usuarios de una sola vez", async () => {
    const fake = createFakeSupabase({
      ob_discounts: [
        { id: "d1", user_id: "u1", amount: 30, reverted: false },
        { id: "d2", user_id: "u2", amount: 20, reverted: false },
      ],
      payout_batch_items: [{ id: "item-1", user_id: "u1", status: "pending", discount_applied: 30 }],
    });

    const result = await getAllAvailableObDiscountTotalsByUser(
      fake as unknown as Parameters<typeof getAllAvailableObDiscountTotalsByUser>[0]
    );

    expect(result.get("u1")).toBe(0);
    expect(result.get("u2")).toBe(20);
  });
});

describe("getConfirmedObDiscountTotal", () => {
  it("un ítem PENDIENTE no resta nada -- el descuento sigue completo hasta que se confirme el pago", async () => {
    const fake = createFakeSupabase({
      ob_discounts: [{ id: "d1", user_id: "u1", amount: 30, reverted: false }],
      payout_batch_items: [{ id: "item-1", user_id: "u1", status: "pending", discount_applied: 30 }],
    });

    expect(await getConfirmedObDiscountTotal(fake as unknown as Parameters<typeof getConfirmedObDiscountTotal>[0], "u1")).toBe(30);
  });

  it("un ítem PAGADO sí resta -- ese descuento ya se gastó de verdad", async () => {
    const fake = createFakeSupabase({
      ob_discounts: [{ id: "d1", user_id: "u1", amount: 30, reverted: false }],
      payout_batch_items: [{ id: "item-1", user_id: "u1", status: "paid", discount_applied: 30 }],
    });

    expect(await getConfirmedObDiscountTotal(fake as unknown as Parameters<typeof getConfirmedObDiscountTotal>[0], "u1")).toBe(0);
  });

  it("mezcla: solo resta la porción del ítem pagado, ignora la del pendiente", async () => {
    const fake = createFakeSupabase({
      ob_discounts: [{ id: "d1", user_id: "u1", amount: 30, reverted: false }],
      payout_batch_items: [
        { id: "item-1", user_id: "u1", status: "pending", discount_applied: 10 },
        { id: "item-2", user_id: "u1", status: "paid", discount_applied: 5 },
      ],
    });

    expect(await getConfirmedObDiscountTotal(fake as unknown as Parameters<typeof getConfirmedObDiscountTotal>[0], "u1")).toBe(25);
  });
});

describe("getAllConfirmedObDiscountTotalsByUser", () => {
  it("calcula lo confirmado de varios usuarios de una sola vez, ignorando ítems pendientes", async () => {
    const fake = createFakeSupabase({
      ob_discounts: [
        { id: "d1", user_id: "u1", amount: 30, reverted: false },
        { id: "d2", user_id: "u2", amount: 20, reverted: false },
      ],
      payout_batch_items: [
        { id: "item-1", user_id: "u1", status: "pending", discount_applied: 30 },
        { id: "item-2", user_id: "u2", status: "paid", discount_applied: 20 },
      ],
    });

    const result = await getAllConfirmedObDiscountTotalsByUser(
      fake as unknown as Parameters<typeof getAllConfirmedObDiscountTotalsByUser>[0]
    );

    expect(result.get("u1")).toBe(30);
    expect(result.get("u2")).toBe(0);
  });
});

describe("getPendingOBTotal (con descuentos ya reclamados por Pagos)", () => {
  it("un descuento reclamado por un ítem PENDIENTE (lote todavía sin confirmar) sigue restándose del total mostrado", async () => {
    const fake = createFakeSupabase({
      service_cuts: [
        { id: "cut-1", user_id: "u1", cut_amount: 50, paid: false },
        { id: "cut-2", user_id: "u1", cut_amount: 50, paid: false },
      ],
      ob_discounts: [{ id: "d1", user_id: "u1", amount: 30, reverted: false }],
      payout_batch_items: [{ id: "item-1", user_id: "u1", status: "pending", discount_applied: 30 }],
    });

    const pending = await getPendingOBTotal(fake as unknown as Parameters<typeof getPendingOBTotal>[0], "u1");
    expect(pending).toBe(70);
  });

  it("una vez confirmado el pago (cut-1 marcado paid), el pendiente baja al resto sin volver a tocar el descuento (ya consumido)", async () => {
    const fake = createFakeSupabase({
      service_cuts: [
        { id: "cut-1", user_id: "u1", cut_amount: 50, paid: true },
        { id: "cut-2", user_id: "u1", cut_amount: 50, paid: false },
      ],
      ob_discounts: [{ id: "d1", user_id: "u1", amount: 30, reverted: false }],
      payout_batch_items: [{ id: "item-1", user_id: "u1", status: "paid", discount_applied: 30 }],
    });

    const pending = await getPendingOBTotal(fake as unknown as Parameters<typeof getPendingOBTotal>[0], "u1");
    expect(pending).toBe(50);
  });
});
