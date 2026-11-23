import { describe, expect, it } from "vitest";
import {
  deriveMainClasses,
  MIN_ILVL_RATIO_FOR_SECONDARY_MAIN,
  MAX_MAIN_CLASSES,
  type MainClassCharacter,
} from "@/lib/main-classes";

const chars = (spec: [string, number, number][]): MainClassCharacter[] =>
  spec.flatMap(([cls, count, ilvl]) => Array.from({ length: count }, () => ({ class: cls, ilvl })));

describe("deriveMainClasses", () => {
  it("la clase con más personajes siempre es main", () => {
    expect(deriveMainClasses(chars([["Paladin", 12, 720], ["Priest", 1, 700]]))).toContain("Paladin");
  });

  it("reconoce una segunda main cuando hay varios personajes y el ilvl acompaña", () => {
    const mains = deriveMainClasses(chars([["Paladin", 12, 720], ["Death Knight", 5, 718]]));
    expect(mains).toEqual(expect.arrayContaining(["Paladin", "Death Knight"]));
  });

  it("no toma como main un alt suelto (falla por cantidad)", () => {
    expect(deriveMainClasses(chars([["Paladin", 12, 720], ["Death Knight", 1, 690]]))).toEqual([
      "Paladin",
    ]);
  });

  it("no toma como main una clase con pocos personajes frente a un pool mucho más grande", () => {
    const mains = deriveMainClasses(chars([["Druid", 11, 292], ["Priest", 2, 292]]));
    expect(mains).toEqual(["Druid"]);
  });

  it("descarta una clase con suficientes personajes si el promedio de ilvl es bajo", () => {
    const mains = deriveMainClasses(
      chars([
        ["Druid", 11, 292],
        ["Evoker", 5, 194],
      ]).concat(chars([["Evoker", 1, 288]]))
    );
    expect(mains).toEqual(["Druid"]);
  });

  it("descarta una clase con suficientes personajes pero muy por debajo del promedio de ilvl", () => {
    const farBelow = Math.round(720 * MIN_ILVL_RATIO_FOR_SECONDARY_MAIN) - 5;
    expect(deriveMainClasses(chars([["Paladin", 12, 720], ["Mage", 4, farBelow]]))).toEqual([
      "Paladin",
    ]);
  });

  it("acepta una clase justo en el límite del porcentaje de ilvl", () => {
    const atLimit = Math.ceil(720 * MIN_ILVL_RATIO_FOR_SECONDARY_MAIN);
    expect(deriveMainClasses(chars([["Paladin", 12, 720], ["Mage", 4, atLimit]]))).toHaveLength(2);
  });

  it("nunca devuelve más mains que el tope", () => {
    const mains = deriveMainClasses(
      chars([
        ["Paladin", 6, 720],
        ["Death Knight", 5, 720],
        ["Mage", 4, 720],
        ["Hunter", 3, 720],
        ["Priest", 2, 720],
      ])
    );
    expect(mains).toHaveLength(MAX_MAIN_CLASSES);
  });

  it("ignora personajes sin clase sincronizada", () => {
    const withNulls: MainClassCharacter[] = [
      ...chars([["Mage", 2, 700]]),
      { class: null, ilvl: 800 },
      { class: null, ilvl: 800 },
      { class: null, ilvl: 800 },
    ];
    expect(deriveMainClasses(withNulls)).toEqual(["Mage"]);
  });

  it("devuelve vacío para un miembro sin personajes utilizables", () => {
    expect(deriveMainClasses([])).toEqual([]);
    expect(deriveMainClasses([{ class: null, ilvl: 700 }])).toEqual([]);
  });

  it("trata el ilvl faltante como cero sin romper la comparación", () => {
    const mains = deriveMainClasses([
      ...chars([["Paladin", 4, 720]]),
      { class: "Mage", ilvl: null },
      { class: "Mage", ilvl: null },
      { class: "Mage", ilvl: null },
    ]);
    expect(mains).toEqual(["Paladin"]);
  });

  it("no descarta por ilvl cuando la clase principal tampoco tiene ilvl cargado", () => {
    const mains = deriveMainClasses([
      ...chars([["Paladin", 5, 0]]),
      ...chars([["Death Knight", 3, 0]]),
    ]);
    expect(mains).toEqual(expect.arrayContaining(["Paladin", "Death Knight"]));
  });
});
