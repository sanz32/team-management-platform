import { describe, expect, it } from "vitest";
import { computeCutRows } from "./service-cuts";

function findRow(rows: ReturnType<typeof computeCutRows>, userId: string) {
  const row = rows.find((r) => r.user_id === userId);
  if (!row) throw new Error(`No se encontró fila para ${userId}`);
  return row;
}

describe("computeCutRows", () => {
  it("reparte el pot en partes iguales entre boosters cuando todos están al 100% (comportamiento histórico)", () => {
    const rows = computeCutRows(
      100,
      "adv",
      [
        { userId: "adv", freelanceName: null, cutPercent: 100 },
        { userId: "b", freelanceName: null, cutPercent: 100 },
        { userId: "c", freelanceName: null, cutPercent: 100 },
        { userId: "d", freelanceName: null, cutPercent: 100 },
      ],
      20
    );

    expect(findRow(rows, "adv").cut_amount).toBeCloseTo(40, 2);
    expect(findRow(rows, "b").cut_amount).toBeCloseTo(20, 2);
    expect(findRow(rows, "c").cut_amount).toBeCloseTo(20, 2);
    expect(findRow(rows, "d").cut_amount).toBeCloseTo(20, 2);
  });

  it("sin ADV, el 100% del pot se reparte entre los boosters", () => {
    const rows = computeCutRows(90, null, [
      { userId: "a", freelanceName: null, cutPercent: 100 },
      { userId: "b", freelanceName: null, cutPercent: 100 },
      { userId: "c", freelanceName: null, cutPercent: 100 },
    ]);

    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.cut_amount).toBeCloseTo(30, 2);
    }
  });

  it("un booster al 50% recibe la mitad de su cut, y el resto se reparte parejo entre los que están al 100%", () => {
    const rows = computeCutRows(80, null, [
      { userId: "a", freelanceName: null, cutPercent: 50 },
      { userId: "b", freelanceName: null, cutPercent: 100 },
      { userId: "c", freelanceName: null, cutPercent: 100 },
      { userId: "d", freelanceName: null, cutPercent: 100 },
    ]);

    expect(findRow(rows, "a").cut_amount).toBeCloseTo(10, 2);
    expect(findRow(rows, "b").cut_amount).toBeCloseTo(23.33, 2);
    expect(findRow(rows, "c").cut_amount).toBeCloseTo(23.33, 2);
    expect(findRow(rows, "d").cut_amount).toBeCloseTo(23.33, 2);

    const total = rows.reduce((sum, r) => sum + r.cut_amount, 0);
    expect(total).toBeCloseTo(80, 1);
  });

  it("varios boosters reducidos: el sobrante combinado se reparte solo entre los que quedaron al 100%", () => {
    const rows = computeCutRows(100, null, [
      { userId: "a", freelanceName: null, cutPercent: 0 },
      { userId: "b", freelanceName: null, cutPercent: 50 },
      { userId: "c", freelanceName: null, cutPercent: 100 },
      { userId: "d", freelanceName: null, cutPercent: 100 },
    ]);

    expect(findRow(rows, "a").cut_amount).toBeCloseTo(0, 2);
    expect(findRow(rows, "b").cut_amount).toBeCloseTo(12.5, 2);
    expect(findRow(rows, "c").cut_amount).toBeCloseTo(43.75, 2);
    expect(findRow(rows, "d").cut_amount).toBeCloseTo(43.75, 2);
  });

  it("si TODOS los boosters bajan su % (nadie queda al 100%), el sobrante se reparte parejo entre todos", () => {
    const rows = computeCutRows(100, null, [
      { userId: "a", freelanceName: null, cutPercent: 50 },
      { userId: "b", freelanceName: null, cutPercent: 50 },
    ]);

    expect(findRow(rows, "a").cut_amount).toBeCloseTo(50, 2);
    expect(findRow(rows, "b").cut_amount).toBeCloseTo(50, 2);
  });

  it("un participante Freelance (sin userId) entra al reparto igual que cualquier booster", () => {
    const rows = computeCutRows(60, null, [
      { userId: "a", freelanceName: null, cutPercent: 100 },
      { userId: null, freelanceName: "Pepe (freelance)", cutPercent: 100 },
    ]);

    expect(rows).toHaveLength(2);
    const freelanceRow = rows.find((r) => r.user_id === null);
    expect(freelanceRow?.freelance_name).toBe("Pepe (freelance)");
    expect(freelanceRow?.cut_amount).toBeCloseTo(30, 2);
    expect(findRow(rows, "a").cut_amount).toBeCloseTo(30, 2);
  });

  it("un Freelance con % reducido resigna su parte igual que un miembro real", () => {
    const rows = computeCutRows(100, null, [
      { userId: "a", freelanceName: null, cutPercent: 100 },
      { userId: "b", freelanceName: null, cutPercent: 100 },
      { userId: null, freelanceName: "Freelance X", cutPercent: 50 },
    ]);

    const freelanceRow = rows.find((r) => r.user_id === null)!;
    expect(freelanceRow.cut_amount).toBeCloseTo(16.66, 2);
    expect(findRow(rows, "a").cut_amount).toBeCloseTo(41.66, 2);
    expect(findRow(rows, "b").cut_amount).toBeCloseTo(41.66, 2);
  });

  it("redondea siempre hacia abajo, nunca al más cercano: el total repartido nunca supera el pot", () => {
    const boosters = [
      { userId: "half-1", freelanceName: null, cutPercent: 50 },
      { userId: "half-2", freelanceName: null, cutPercent: 50 },
      ...Array.from({ length: 18 }, (_, i) => ({
        userId: `full-${i}`,
        freelanceName: null,
        cutPercent: 100,
      })),
    ];

    const rows = computeCutRows(107, null, boosters);

    expect(findRow(rows, "half-1").cut_amount).toBeCloseTo(2.67, 2);
    expect(findRow(rows, "half-2").cut_amount).toBeCloseTo(2.67, 2);
    expect(findRow(rows, "full-0").cut_amount).toBeCloseTo(5.64, 2);

    const total = rows.reduce((sum, r) => sum + r.cut_amount, 0);
    expect(total).toBeLessThanOrEqual(107);
    expect(total).toBeCloseTo(106.86, 2);
  });

  it("el ADV que también boostea con % reducido: la reducción aplica solo a su parte de booster, nunca a su comisión", () => {
    const rows = computeCutRows(
      100,
      "adv",
      [
        { userId: "adv", freelanceName: null, cutPercent: 50 },
        { userId: "b", freelanceName: null, cutPercent: 100 },
      ],
      20
    );

    expect(findRow(rows, "adv").cut_amount).toBeCloseTo(40, 2);
    expect(findRow(rows, "b").cut_amount).toBeCloseTo(60, 2);
  });

  it("el ADV que no boostea sigue recibiendo su comisión en una fila propia", () => {
    const rows = computeCutRows(
      100,
      "adv",
      [
        { userId: "b", freelanceName: null, cutPercent: 100 },
        { userId: "c", freelanceName: null, cutPercent: 100 },
      ],
      20
    );

    expect(findRow(rows, "adv").cut_amount).toBeCloseTo(20, 2);
    expect(findRow(rows, "b").cut_amount).toBeCloseTo(40, 2);
    expect(findRow(rows, "c").cut_amount).toBeCloseTo(40, 2);
  });

  it("deduplica boosters repetidos por userId (no se puede seleccionar dos veces al mismo miembro)", () => {
    const rows = computeCutRows(60, null, [
      { userId: "a", freelanceName: null, cutPercent: 100 },
      { userId: "a", freelanceName: null, cutPercent: 100 },
      { userId: "b", freelanceName: null, cutPercent: 100 },
    ]);

    expect(rows).toHaveLength(2);
    expect(findRow(rows, "a").cut_amount).toBeCloseTo(30, 2);
  });
});
