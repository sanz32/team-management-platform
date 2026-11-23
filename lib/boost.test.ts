import { describe, it, expect } from "vitest";
import {
  slotQueryFloor,
  remainingCapacity,
  runWindowEnd,
  slotPruneCutoff,
  BOOST_RUN_WINDOW_HOURS,
  BOOST_SLOT_PRUNE_HOURS,
  isSlotBookable,
  isSlotVisible,
  splitOfferTitle,
  boostSchedulingWindow,
  isWithinSchedulingWindow,
  realmSlug,
  isPlausibleCharacterName,
  raiderSlugCandidates,
  formatGold,
  isHoneypotTripped,
  checkFormTiming,
  isRateLimited,
  isBoostCategory,
  isBoostRegion,
  isBoostStatus,
  MIN_FORM_SECONDS,
  MAX_FORM_SECONDS,
} from "./boost";

describe("remainingCapacity", () => {
  it("resta las reservas del cupo", () => {
    expect(remainingCapacity(8, 3, 0)).toBe(5);
  });

  it("resta TAMBIÉN los cupos apartados por la tienda", () => {
    expect(remainingCapacity(13, 8, 2)).toBe(3);
  });

  it("nunca devuelve negativo aunque el cupo se haya bajado a mano", () => {
    expect(remainingCapacity(2, 5, 0)).toBe(0);
  });

  it("tampoco devuelve negativo cuando lo que sobra son apartados", () => {
    expect(remainingCapacity(3, 2, 4)).toBe(0);
  });
});

describe("isSlotBookable", () => {
  const now = new Date("2026-09-06T12:00:00Z");
  const base = {
    scheduledAt: "2026-09-08T20:00:00Z",
    capacity: 5,
    bookedCount: 2,
    localHoldCount: 0,
    isActive: true,
  };

  it("acepta un horario futuro con cupo", () => {
    expect(isSlotBookable(base, now)).toBe(true);
  });

  it("rechaza uno lleno", () => {
    expect(isSlotBookable({ ...base, bookedCount: 5 }, now)).toBe(false);
  });

  it("rechaza uno que se llenó con reservas de la tienda", () => {
    expect(isSlotBookable({ ...base, localHoldCount: 3 }, now)).toBe(false);
  });

  it("acepta mientras la suma de los dos contadores deje lugar", () => {
    expect(isSlotBookable({ ...base, localHoldCount: 2 }, now)).toBe(true);
  });

  it("rechaza uno desactivado aunque le sobre cupo", () => {
    expect(isSlotBookable({ ...base, isActive: false }, now)).toBe(false);
  });

  it("rechaza uno que ya pasó, aunque tenga cupo libre", () => {
    expect(isSlotBookable({ ...base, scheduledAt: "2026-09-05T20:00:00Z" }, now)).toBe(false);
  });

  it("ACEPTA el instante exacto del horario: al bloque le quedan 2 horas", () => {
    expect(isSlotBookable({ ...base, scheduledAt: "2026-09-06T12:00:00Z" }, now)).toBe(true);
  });

  it("rechaza una cuyo bloque ya cerró", () => {
    expect(isSlotBookable({ ...base, scheduledAt: "2026-09-06T09:59:00Z" }, now)).toBe(false);
  });

  it("rechaza una fecha ilegible en vez de tratarla como válida", () => {
    expect(isSlotBookable({ ...base, scheduledAt: "mañana" }, now)).toBe(false);
  });

  it("acepta un objeto Date igual que un string ISO", () => {
    expect(isSlotBookable({ ...base, scheduledAt: new Date("2026-09-08T20:00:00Z") }, now)).toBe(true);
  });
});

describe("isSlotVisible", () => {
  const now = new Date("2026-09-06T12:00:00Z");
  const base = { scheduledAt: "2026-09-08T20:00:00Z", isActive: true };

  it("muestra un horario futuro y activo", () => {
    expect(isSlotVisible(base, now)).toBe(true);
  });

  it("MUESTRA uno lleno, a diferencia de isSlotBookable", () => {
    const full = {
      scheduledAt: base.scheduledAt,
      capacity: 5,
      bookedCount: 5,
      localHoldCount: 0,
      isActive: true,
    };
    expect(isSlotVisible(full, now)).toBe(true);
    expect(isSlotBookable(full, now)).toBe(false);
  });

  it("esconde uno desactivado por el admin", () => {
    expect(isSlotVisible({ ...base, isActive: false }, now)).toBe(false);
  });

  it("SIGUE mostrando una run en curso: el bloque dura 2 horas", () => {
    const enCurso = { scheduledAt: "2026-09-06T11:00:00Z", isActive: true };
    expect(isSlotVisible(enCurso, now)).toBe(true);
  });

  it("la muestra hasta el ultimo minuto del bloque", () => {
    const casiTermina = { scheduledAt: "2026-09-06T10:01:00Z", isActive: true };
    expect(isSlotVisible(casiTermina, now)).toBe(true);
  });

  it("la esconde cuando el bloque YA termino", () => {
    const termino = { scheduledAt: "2026-09-06T09:59:00Z", isActive: true };
    expect(isSlotVisible(termino, now)).toBe(false);
  });

  it("esconde una de un dia anterior", () => {
    expect(isSlotVisible({ ...base, scheduledAt: "2026-09-05T20:00:00Z" }, now)).toBe(false);
  });

  it("una run en curso con cupo SE PUEDE reservar", () => {
    const enCurso = {
      scheduledAt: "2026-09-06T11:00:00Z",
      capacity: 13,
      bookedCount: 6,
      localHoldCount: 0,
      isActive: true,
    };
    expect(isSlotBookable(enCurso, now)).toBe(true);
  });

  it("esconde una fecha ilegible en vez de tratarla como válida", () => {
    expect(isSlotVisible({ ...base, scheduledAt: "mañana" }, now)).toBe(false);
  });
});

describe("boostSchedulingWindow", () => {
  const inGuildZone = (d: Date) =>
    d.toLocaleString("en-CA", {
      timeZone: "America/Santiago",
      weekday: "short",
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });

  it("arranca un lunes a las 00:00 y termina un domingo a las 23:59, hora del guild", () => {
    const { start, end } = boostSchedulingWindow(new Date("2026-09-09T15:00:00Z"));
    expect(inGuildZone(start)).toBe("Mon, 2026-09-07, 00:00");
    expect(inGuildZone(end)).toBe("Sun, 2026-09-20, 23:59");
  });

  it("un domingo sigue perteneciendo a la semana que arrancó el lunes anterior", () => {
    const { start } = boostSchedulingWindow(new Date("2026-09-13T18:00:00Z"));
    expect(inGuildZone(start)).toBe("Mon, 2026-09-07, 00:00");
  });

  it("cubre una run de domingo a la noche, hora chilena", () => {
    const now = new Date("2026-09-09T15:00:00Z");
    const sundayNight = new Date("2026-09-21T00:00:00Z");
    expect(inGuildZone(sundayNight).startsWith("Sun, 2026-09-20")).toBe(true);
    expect(isWithinSchedulingWindow(sundayNight, now)).toBe(true);
  });

  it("la ventana dura 14 días de calendario", () => {
    const { start, end } = boostSchedulingWindow(new Date("2026-09-09T15:00:00Z"));
    const days = (end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000);
    expect(days).toBeGreaterThan(13.9);
    expect(days).toBeLessThan(14.05);
  });
});

describe("isWithinSchedulingWindow", () => {
  const now = new Date("2026-09-09T15:00:00Z");

  it("acepta un horario de esta semana", () => {
    expect(isWithinSchedulingWindow(new Date("2026-09-11T22:00:00Z"), now)).toBe(true);
  });

  it("acepta uno de la semana siguiente", () => {
    expect(isWithinSchedulingWindow(new Date("2026-09-18T22:00:00Z"), now)).toBe(true);
  });

  it("rechaza uno de la semana subsiguiente", () => {
    expect(isWithinSchedulingWindow(new Date("2026-09-21T22:00:00Z"), now)).toBe(false);
  });

  it("rechaza uno de la semana pasada", () => {
    expect(isWithinSchedulingWindow(new Date("2026-09-06T22:00:00Z"), now)).toBe(false);
  });

  it("rechaza una fecha ilegible en vez de darla por válida", () => {
    expect(isWithinSchedulingWindow(new Date("no es una fecha"), now)).toBe(false);
  });
});

describe("splitOfferTitle", () => {
  const marked = (title: string) =>
    splitOfferTitle(title)
      .map((s) => (s.jargon ? `|${s.text}|` : s.text))
      .join("");

  it("resalta FP con su número", () => {
    expect(marked("Venomous Abyss 8/8 FP 15")).toBe("Venomous Abyss 8/8 |FP 15|");
  });

  it("resalta ATP con su número", () => {
    expect(marked("Venomous Abyss 8/8 ATP 10")).toBe("Venomous Abyss 8/8 |ATP 10|");
  });

  it("resalta el número pegado sin espacio", () => {
    expect(marked("Tidebound Grotto FP15")).toBe("Tidebound Grotto |FP15|");
  });

  it("resalta VIP sin comerse los paréntesis", () => {
    expect(marked("Venomous + Tidebound 9/9 FP 10 (VIP)")).toBe(
      "Venomous + Tidebound 9/9 |FP 10| (|VIP|)"
    );
  });

  it("resalta el nivel aunque la fracción de jefes se meta en el medio", () => {
    expect(marked("Venomous + Tidebound FP 9/9 20 (VIP)")).toBe(
      "Venomous + Tidebound |FP| 9/9| 20| (|VIP|)"
    );
    expect(marked("Venomous + Tidebound FP 9/9 26 (VIP)")).toBe(
      "Venomous + Tidebound |FP| 9/9| 26| (|VIP|)"
    );
  });

  it("deja la fracción sola cuando no hay nivel después", () => {
    expect(marked("Venomous + Tidebound FP 9/9")).toBe("Venomous + Tidebound |FP| 9/9");
  });

  it("resalta SAVED y UNSAVED", () => {
    expect(marked("Tidebound Grotto SAVED")).toBe("Tidebound Grotto |SAVED|");
    expect(marked("Venomous Abyss UNSAVED")).toBe("Venomous Abyss |UNSAVED|");
  });

  it("no confunde otra palabra en mayúsculas con jerga", () => {
    expect(marked("Venomous Abyss 6/8 UNSAVED + Last TWO SAVED")).toBe(
      "Venomous Abyss 6/8 |UNSAVED| + Last TWO |SAVED|"
    );
  });

  it("devuelve el título entero sin marcar cuando no hay jerga", () => {
    expect(splitOfferTitle("Venomous Abyss 2 Last Bosses")).toEqual([
      { text: "Venomous Abyss 2 Last Bosses", jargon: false },
    ]);
  });

  it("nunca pierde ni duplica texto", () => {
    for (const title of [
      "Venomous Abyss 8/8 ATP 26",
      "Venomous + Tidebound FP 9/9 26 (VIP)",
      "Tidebound Grotto UNSAVED",
      "Venomous Abyss Last Boss",
    ]) {
      expect(splitOfferTitle(title).map((s) => s.text).join("")).toBe(title);
    }
  });
});

describe("realmSlug", () => {
  it("pasa un reino simple a minúsculas", () => {
    expect(realmSlug("Stormrage")).toBe("stormrage");
  });

  it("saca el apóstrofe (Zul'jin -> zuljin, como espera Blizzard)", () => {
    expect(realmSlug("Zul'jin")).toBe("zuljin");
    expect(realmSlug("Mal'Ganis")).toBe("malganis");
  });

  it("acepta el apóstrofe tipográfico que copia y pega mucha gente", () => {
    expect(realmSlug("Zul’jin")).toBe("zuljin");
  });

  it("une los espacios con guión", () => {
    expect(realmSlug("Area 52")).toBe("area-52");
    expect(realmSlug("Twisting Nether")).toBe("twisting-nether");
  });

  it("pela acentos de los reinos de EU/LatAm", () => {
    expect(realmSlug("Uldum")).toBe("uldum");
    expect(realmSlug("Dun Modr")).toBe("dun-modr");
    expect(realmSlug("Los Errantes")).toBe("los-errantes");
    expect(realmSlug("Sanguino")).toBe("sanguino");
    expect(realmSlug("Éonar")).toBe("eonar");
  });

  it("tolera espacios de sobra al principio y al final", () => {
    expect(realmSlug("  Area 52  ")).toBe("area-52");
  });

  it("devuelve vacío si no quedó nada usable", () => {
    expect(realmSlug("!!!")).toBe("");
  });
});

describe("isPlausibleCharacterName", () => {
  it("acepta nombres normales", () => {
    expect(isPlausibleCharacterName("Arden")).toBe(true);
  });

  it("acepta nombres con acentos, que este guild tiene de verdad", () => {
    expect(isPlausibleCharacterName("Nèry")).toBe(true);
    expect(isPlausibleCharacterName("Nërÿ")).toBe(true);
  });

  it("rechaza lo que no puede ser un nombre de WoW", () => {
    expect(isPlausibleCharacterName("a")).toBe(false);
    expect(isPlausibleCharacterName("Arden-Stormrage")).toBe(false);
    expect(isPlausibleCharacterName("Arden 2")).toBe(false);
    expect(isPlausibleCharacterName("Muchisimolargo")).toBe(false);
    expect(isPlausibleCharacterName("")).toBe(false);
  });
});

describe("raiderSlugCandidates", () => {
  it("prefiere el nick tal cual", () => {
    expect(raiderSlugCandidates("Arden")[0]).toBe("arden");
  });

  it("normaliza acentos y espacios del nick", () => {
    expect(raiderSlugCandidates("Nèry Raids")[0]).toBe("nery-raids");
  });

  it("ofrece alternativas con sufijo para resolver una colisión", () => {
    const candidates = raiderSlugCandidates("Arden", ["a1b2", "c3d4"]);
    expect(candidates[0]).toBe("arden");
    expect(candidates[1]).toBe("arden-a1b2");
    expect(candidates[2]).toBe("arden-c3d4");
    expect(new Set(candidates).size).toBe(candidates.length);
  });

  it("nunca devuelve un slug vacío cuando el nick no deja nada latino", () => {
    const candidates = raiderSlugCandidates("🐉🔥", ["a1b2"]);
    expect(candidates).toEqual(["gg-a1b2"]);
    expect(candidates.every((c) => c.length >= 2)).toBe(true);
  });

  it("no devuelve nada si no hay base ni sufijos (quien llama tiene que reintentar)", () => {
    expect(raiderSlugCandidates("🐉")).toEqual([]);
  });

  it("respeta el tope de largo en todos los candidatos", () => {
    const candidates = raiderSlugCandidates("Un Nombre De Raider Larguísimo De Verdad", ["a1b2"]);
    expect(candidates.every((c) => c.length <= 24)).toBe(true);
  });

  it("no deja un guión colgando al recortar", () => {
    const candidates = raiderSlugCandidates("Raider Larguisimo Aqui X", ["z9"]);
    expect(candidates.every((c) => !c.endsWith("-"))).toBe(true);
  });
});

describe("formatGold", () => {
  it("muestra la cifra completa con separadores, nunca abreviada", () => {
    expect(formatGold(8650000, "en")).toBe("8,650,000");
    expect(formatGold(8650000, "es")).toBe("8.650.000");
  });

  it("formatea precios chicos igual de bien", () => {
    expect(formatGold(50000, "en")).toBe("50,000");
  });
});

describe("anti-spam", () => {
  it("detecta el honeypot lleno", () => {
    expect(isHoneypotTripped("http://spam.example")).toBe(true);
  });

  it("un honeypot vacío o con espacios no dispara nada", () => {
    expect(isHoneypotTripped("")).toBe(false);
    expect(isHoneypotTripped("   ")).toBe(false);
    expect(isHoneypotTripped(undefined)).toBe(false);
  });

  it("rechaza un submit más rápido que un humano", () => {
    const issued = 1_000_000;
    expect(checkFormTiming(issued, issued + 500)).toBe("too_fast");
  });

  it("acepta un submit con el tiempo mínimo cumplido", () => {
    const issued = 1_000_000;
    expect(checkFormTiming(issued, issued + MIN_FORM_SECONDS * 1000)).toBe("ok");
  });

  it("rechaza un token de formulario viejo", () => {
    const issued = 1_000_000;
    expect(checkFormTiming(issued, issued + (MAX_FORM_SECONDS + 1) * 1000)).toBe("expired");
  });

  it("trata un token emitido 'en el futuro' como demasiado rápido", () => {
    expect(checkFormTiming(2_000_000, 1_000_000)).toBe("too_fast");
  });

  it("corta al llegar al máximo de reservas, no después", () => {
    expect(isRateLimited(2, 3)).toBe(false);
    expect(isRateLimited(3, 3)).toBe(true);
    expect(isRateLimited(9, 3)).toBe(true);
  });
});

describe("guardas de valores que llegan de afuera", () => {
  it("solo acepta las 3 dificultades reales", () => {
    expect(isBoostCategory("heroic")).toBe(true);
    expect(isBoostCategory("lfr")).toBe(false);
    expect(isBoostCategory(null)).toBe(false);
  });

  it("solo acepta las 4 regiones de Blizzard", () => {
    expect(isBoostRegion("us")).toBe(true);
    expect(isBoostRegion("evil.example.com")).toBe(false);
  });

  it("solo acepta los 4 estados de un lead", () => {
    expect(isBoostStatus("pending")).toBe(true);
    expect(isBoostStatus("paid")).toBe(false);
  });
});

describe("runWindowEnd", () => {
  it("la ventana de una corrida dura BOOST_RUN_WINDOW_HOURS", () => {
    const inicio = new Date("2026-09-11T23:00:00Z");
    const fin = runWindowEnd(inicio);
    expect(fin.getTime() - inicio.getTime()).toBe(BOOST_RUN_WINDOW_HOURS * 3600_000);
  });

  it("acepta la fecha como string, que es como viene de la base", () => {
    expect(runWindowEnd("2026-09-11T23:00:00Z").toISOString()).toBe("2026-09-12T01:00:00.000Z");
  });
});

describe("slotPruneCutoff", () => {
  it("una corrida se borra BOOST_SLOT_PRUNE_HOURS despues de empezar", () => {
    const alasSiete = new Date("2026-09-11T19:00:00Z");
    const alasNueve = new Date("2026-09-11T21:00:00Z");
    const alasDiez = new Date("2026-09-11T22:00:00Z");

    expect(alasSiete.getTime() < slotPruneCutoff(alasNueve).getTime()).toBe(false);
    expect(alasSiete.getTime() < slotPruneCutoff(alasDiez).getTime()).toBe(false);
    expect(alasSiete.getTime() <= slotPruneCutoff(alasDiez).getTime()).toBe(true);
    const unMinutoDespues = new Date(alasDiez.getTime() + 60_000);
    expect(alasSiete.getTime() < slotPruneCutoff(unMinutoDespues).getTime()).toBe(true);
  });

  it("el corte deja pasar una hora de colchon despues de la ventana", () => {
    expect(BOOST_SLOT_PRUNE_HOURS).toBeGreaterThan(BOOST_RUN_WINDOW_HOURS);
  });

  it("nunca borra una corrida futura", () => {
    const ahora = new Date("2026-09-11T19:00:00Z");
    const futura = new Date("2026-09-11T23:00:00Z");
    expect(futura.getTime() < slotPruneCutoff(ahora).getTime()).toBe(false);
  });
});

describe("slotQueryFloor", () => {
  it("deja pasar una ventana entera hacia atrás", () => {
    const ahora = new Date("2026-09-11T23:20:00Z");
    expect(slotQueryFloor(ahora).toISOString()).toBe("2026-09-11T21:20:00.000Z");
  });

  it("el piso deja entrar una run EN CURSO, que es para lo que existe", () => {
    const ahora = new Date("2026-09-11T23:20:00Z");
    const enCurso = new Date("2026-09-11T22:00:00Z");
    expect(enCurso.getTime()).toBeGreaterThanOrEqual(slotQueryFloor(ahora).getTime());
  });

  it("el piso NO deja entrar una cuyo bloque ya cerro", () => {
    const ahora = new Date("2026-09-11T23:20:00Z");
    const cerrada = new Date("2026-09-11T21:00:00Z");
    expect(cerrada.getTime()).toBeLessThan(slotQueryFloor(ahora).getTime());
  });

  it("es mas generoso que isSlotVisible, nunca al reves", () => {
    const ahora = new Date("2026-09-11T23:20:00Z");
    const piso = slotQueryFloor(ahora);
    expect(isSlotVisible({ scheduledAt: piso.toISOString(), isActive: true }, ahora)).toBe(false);
    const unMinutoDespues = new Date(piso.getTime() + 60_000);
    expect(isSlotVisible({ scheduledAt: unMinutoDespues.toISOString(), isActive: true }, ahora)).toBe(true);
  });
});
