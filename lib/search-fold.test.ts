import { describe, it, expect } from "vitest";
import { foldForSearch, matchesSearch } from "./search-fold";

describe("foldForSearch", () => {
  it("quita acentos y pasa a minúsculas", () => {
    expect(foldForSearch("Nèry")).toBe("nery");
    expect(foldForSearch("Días Libres")).toBe("dias libres");
    expect(foldForSearch("Configuración")).toBe("configuracion");
  });

  it("la eñe también se pliega, y es lo que se quiere", () => {
    expect(foldForSearch("Compañeros")).toBe("companeros");
    expect(foldForSearch("COMPAÑEROS")).toBe("companeros");
    expect(matchesSearch("companeros", "Compañeros")).toBe(true);
  });

  it("no toca texto que ya está plegado", () => {
    expect(foldForSearch("nery")).toBe("nery");
    expect(foldForSearch("")).toBe("");
  });

  it("cubre las diacríticas del rango completo", () => {
    expect(foldForSearch("àéîõü")).toBe("aeiou");
    expect(foldForSearch("Ÿ")).toBe("y");
  });
});

describe("matchesSearch", () => {
  it("encuentra con acento escribiendo sin acento, y al revés", () => {
    expect(matchesSearch("nery", "Nèry")).toBe(true);
    expect(matchesSearch("nèry", "Nery")).toBe(true);
    expect(matchesSearch("NERY", "nërÿ")).toBe(true);
  });

  it("busca por trozo, no solo por el nombre completo", () => {
    expect(matchesSearch("dias", "Días Libres")).toBe(true);
    expect(matchesSearch("libres", "Días Libres")).toBe(true);
  });

  it("mira todos los campos que se le pasen", () => {
    expect(matchesSearch("stormrage", "Vielleicht", "stormrage")).toBe(true);
    expect(matchesSearch("nadie", "Vielleicht", "stormrage")).toBe(false);
  });

  it("un campo nulo o vacío no rompe ni matchea", () => {
    expect(matchesSearch("algo", null, undefined, "")).toBe(false);
    expect(matchesSearch("algo", null, "algo")).toBe(true);
  });

  it("un término vacío no matchea con nada", () => {
    expect(matchesSearch("", "cualquier cosa")).toBe(false);
    expect(matchesSearch("   ", "cualquier cosa")).toBe(false);
  });
});
