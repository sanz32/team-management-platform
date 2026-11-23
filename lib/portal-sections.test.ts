import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PORTAL_SECTIONS, sectionsForRole } from "./portal-sections";

function allowListFromProxy(constName: string): string[] {
  const source = readFileSync(join(process.cwd(), "proxy.ts"), "utf8");
  const start = source.indexOf(`const ${constName} =`);
  if (start === -1) throw new Error(`No se encontró ${constName} en proxy.ts`);
  const end = source.indexOf(";", start);
  const block = source.slice(start, end);
  const paths = new Set<string>();
  if (/pathname === "\/"/.test(block)) paths.add("/");
  for (const match of block.matchAll(/pathname\.startsWith\("([^"]+)"\)/g)) {
    paths.add(match[1]);
  }
  return [...paths];
}

function proxyAllows(allowed: string[], href: string): boolean {
  return allowed.some((p) => (p === "/" ? href === "/" : href.startsWith(p)));
}

describe("PORTAL_SECTIONS", () => {
  it("no repite rutas", () => {
    const hrefs = PORTAL_SECTIONS.map((s) => s.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("cada sección tiene etiqueta, área e ícono", () => {
    for (const s of PORTAL_SECTIONS) {
      expect(s.label.trim(), `label de ${s.href}`).not.toBe("");
      expect(s.area.trim(), `area de ${s.href}`).not.toBe("");
      expect(s.icon, `icon de ${s.href}`).toBeTruthy();
    }
  });

  it("una sección marcada visible para guest tiene que estar permitida en proxy.ts", () => {
    const allowed = allowListFromProxy("isGuestAllowedPath");
    for (const s of PORTAL_SECTIONS.filter((x) => x.guestVisible)) {
      expect(proxyAllows(allowed, s.href), `${s.href} está marcada guestVisible pero proxy.ts la bloquea`).toBe(true);
    }
  });

  it("una sección marcada visible para friend tiene que estar permitida en proxy.ts", () => {
    const allowed = allowListFromProxy("isFriendAllowedPath");
    for (const s of PORTAL_SECTIONS.filter((x) => x.friendVisible)) {
      expect(proxyAllows(allowed, s.href), `${s.href} está marcada friendVisible pero proxy.ts la bloquea`).toBe(true);
    }
  });

  it("no esconde de guest una sección a la que sí puede entrar", () => {
    const allowed = allowListFromProxy("isGuestAllowedPath");
    const notSections = new Set(["/onboarding/nickname", "/conectar-app"]);
    const missing = PORTAL_SECTIONS.filter(
      (s) => !s.guestVisible && !notSections.has(s.href) && proxyAllows(allowed, s.href),
    ).map((s) => s.href);
    expect(missing, "estas rutas las permite el proxy para guest pero el buscador se las esconde").toEqual([]);
  });

  it("no esconde de friend una sección a la que sí puede entrar", () => {
    const allowed = allowListFromProxy("isFriendAllowedPath");
    const notSections = new Set(["/onboarding/nickname", "/conectar-app"]);
    const missing = PORTAL_SECTIONS.filter(
      (s) => !s.friendVisible && !notSections.has(s.href) && proxyAllows(allowed, s.href),
    ).map((s) => s.href);
    expect(missing, "estas rutas las permite el proxy para friend pero el buscador se las esconde").toEqual([]);
  });
});

describe("sectionsForRole", () => {
  it("un admin ve todo", () => {
    expect(sectionsForRole("admin")).toHaveLength(PORTAL_SECTIONS.length);
  });

  it("un manager no ve las de solo admin", () => {
    const manager = sectionsForRole("manager").map((s) => s.href);
    expect(manager).not.toContain("/cuentas");
    expect(manager).toContain("/miembros");
  });

  it("un member no ve gestión ni las de solo admin", () => {
    const member = sectionsForRole("member").map((s) => s.href);
    expect(member).not.toContain("/cuentas");
    expect(member).not.toContain("/miembros");
    expect(member).not.toContain("/configuracion");
    expect(member).toContain("/puntos");
  });

  it("guest y friend ven listas cada vez más chicas", () => {
    const all = sectionsForRole("member").length;
    const guest = sectionsForRole("guest").length;
    const friend = sectionsForRole("friend").length;
    expect(guest).toBeLessThan(all);
    expect(friend).toBeLessThan(guest);
  });

  it("los 9 enlaces de la barra siguen siendo los mismos para un member", () => {
    const nav = sectionsForRole("member")
      .filter((s) => s.inNavBar)
      .map((s) => s.href);
    expect(nav).toEqual([
      "/",
      "/characters",
      "/balance",
      "/dias-libres",
      "/resumen-semanal",
      "/runs-ob",
      "/roster",
      "/wishlist",
      "/grupos-miticos",
    ]);
  });
});
