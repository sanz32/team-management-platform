import { describe, it, expect } from "vitest";
import {
  DEALS_PER_GROUP,
  DEAL_DISCOUNT_PCT,
  applyDeal,
  dealDayKey,
  discountedPriceGold,
  nextRotationAt,
  pickDailyDealIds,
  type DealCandidate,
} from "./boost-deals";

function catalogo(): DealCandidate[] {
  const rows: DealCandidate[] = [];
  const grupos: [DealCandidate["category"], string, number][] = [
    ["normal", "Venomous Abyss + Tidebound Grotto", 7],
    ["normal", "VIP, ATP & FP", 11],
    ["heroic", "Venomous Abyss + Tidebound Grotto", 11],
    ["heroic", "VIP, ATP & FP", 12],
    ["mythic", "VIP, ATP & FP", 9],
  ];
  for (const [category, groupLabel, cuantos] of grupos) {
    for (let i = 0; i < cuantos; i++) {
      rows.push({ id: `${category}-${groupLabel.slice(0, 3)}-${i}`, category, groupLabel });
    }
  }
  return rows;
}

describe("discountedPriceGold", () => {
  it("descuenta el 10% de los precios reales del catálogo", () => {
    expect(discountedPriceGold(550_000)).toBe(495_000);
    expect(discountedPriceGold(50_000)).toBe(45_000);
    expect(discountedPriceGold(22_500_000)).toBe(20_250_000);
    expect(discountedPriceGold(1_950_000)).toBe(1_755_000);
  });

  it("nunca da más descuento que el autorizado", () => {
    for (const precio of [1, 999, 1_001, 7_777, 123_456, 999_999]) {
      const final = discountedPriceGold(precio);
      const descuentoReal = ((precio - final) / precio) * 100;
      expect(descuentoReal).toBeLessThanOrEqual(DEAL_DISCOUNT_PCT + 1e-9);
      expect(final).toBeLessThanOrEqual(precio);
    }
  });

  it("no rompe con precios inválidos", () => {
    expect(discountedPriceGold(0)).toBe(0);
    expect(discountedPriceGold(-5)).toBe(0);
    expect(discountedPriceGold(Number.NaN)).toBe(0);
  });
});

describe("pickDailyDealIds", () => {
  it("elige DEALS_PER_GROUP por grupo, no del catálogo entero", () => {
    const offers = catalogo();
    const elegidos = pickDailyDealIds(offers, "2026-09-11");

    const porGrupo = new Map<string, number>();
    for (const offer of offers) {
      if (!elegidos.has(offer.id)) continue;
      const key = `${offer.category}::${offer.groupLabel}`;
      porGrupo.set(key, (porGrupo.get(key) ?? 0) + 1);
    }

    expect(porGrupo.size).toBe(5);
    for (const cantidad of porGrupo.values()) expect(cantidad).toBe(DEALS_PER_GROUP);
    expect(elegidos.size).toBe(5 * DEALS_PER_GROUP);
  });

  it("es estable dentro del mismo día", () => {
    const offers = catalogo();
    const a = pickDailyDealIds(offers, "2026-09-11");
    const b = pickDailyDealIds(offers, "2026-09-11");
    expect([...a].sort()).toEqual([...b].sort());
  });

  it("no depende del orden en que vengan los paquetes", () => {
    const offers = catalogo();
    const alReves = [...offers].reverse();
    const a = pickDailyDealIds(offers, "2026-09-11");
    const b = pickDailyDealIds(alReves, "2026-09-11");
    expect([...a].sort()).toEqual([...b].sort());
  });

  it("cambia de un día al otro", () => {
    const offers = catalogo();
    const dias = ["2026-09-11", "2026-09-12", "2026-09-13", "2026-09-14", "2026-09-15"];
    const conjuntos = dias.map((d) => [...pickDailyDealIds(offers, d)].sort().join("|"));
    expect(new Set(conjuntos).size).toBeGreaterThan(1);
  });

  it("reparte las ofertas entre todos los paquetes a lo largo de un mes", () => {
    const offers = catalogo();
    const vistos = new Set<string>();
    for (let dia = 1; dia <= 30; dia++) {
      const key = `2026-10-${String(dia).padStart(2, "0")}`;
      for (const id of pickDailyDealIds(offers, key)) vistos.add(id);
    }
    expect(vistos.size).toBe(offers.length);
  });

  it("un grupo con menos paquetes que el cupo los pone todos en oferta", () => {
    const chicos: DealCandidate[] = [
      { id: "a", category: "mythic", groupLabel: "Solo dos" },
      { id: "b", category: "mythic", groupLabel: "Solo dos" },
    ];
    const elegidos = pickDailyDealIds(chicos, "2026-09-11");
    expect(elegidos.size).toBe(2);
  });

  it("no elige nada con el catálogo vacío", () => {
    expect(pickDailyDealIds([], "2026-09-11").size).toBe(0);
  });

  it("nunca repite el mismo paquete dentro del día", () => {
    const offers = catalogo();
    for (let dia = 1; dia <= 28; dia++) {
      const key = `2026-11-${String(dia).padStart(2, "0")}`;
      const elegidos = pickDailyDealIds(offers, key);
      expect(elegidos.size).toBe(5 * DEALS_PER_GROUP);
    }
  });
});

describe("applyDeal", () => {
  it("sin oferta deja el precio intacto y sin tachado", () => {
    expect(applyDeal(550_000, false)).toEqual({ priceGold: 550_000, listPriceGold: null });
  });

  it("con oferta cobra menos y guarda el precio de lista", () => {
    expect(applyDeal(550_000, true)).toEqual({ priceGold: 495_000, listPriceGold: 550_000 });
  });

  it("no anuncia oferta si el descuento no baja el precio", () => {
    expect(applyDeal(0, true)).toEqual({ priceGold: 0, listPriceGold: null });
  });
});

describe("dealDayKey / nextRotationAt", () => {
  it("rota a la medianoche de Chile, no a la de UTC", () => {
    expect(dealDayKey(new Date("2026-09-11T02:59:00Z"))).toBe("2026-09-10");
    expect(dealDayKey(new Date("2026-09-11T03:00:00Z"))).toBe("2026-09-11");
  });

  it("sigue el cambio de hora: en invierno el corte se mueve una hora", () => {
    expect(dealDayKey(new Date("2026-06-11T03:30:00Z"))).toBe("2026-06-10");
    expect(dealDayKey(new Date("2026-06-11T04:30:00Z"))).toBe("2026-06-11");
  });

  it("la próxima rotación cae después de ahora y antes de 24h + 1h de DST", () => {
    const ahora = new Date("2026-09-11T18:00:00Z");
    const proxima = nextRotationAt(ahora);
    expect(proxima.getTime()).toBeGreaterThan(ahora.getTime());
    expect(proxima.getTime() - ahora.getTime()).toBeLessThanOrEqual(25 * 60 * 60 * 1000);
  });

  it("el día de las ofertas cambia exactamente en la rotación anunciada", () => {
    const ahora = new Date("2026-09-11T18:00:00Z");
    const proxima = nextRotationAt(ahora);
    const unMinutoAntes = new Date(proxima.getTime() - 60_000);
    const unMinutoDespues = new Date(proxima.getTime() + 60_000);
    expect(dealDayKey(unMinutoAntes)).toBe(dealDayKey(ahora));
    expect(dealDayKey(unMinutoDespues)).not.toBe(dealDayKey(ahora));
  });
});
