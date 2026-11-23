import { describe, it, expect } from "vitest";
import {
  buildSlotTemplates,
  suggestTemplates,
  templateKey,
  type TemplateSlot,
} from "./boost-slot-templates";

const AHORA = new Date("2026-09-11T12:00:00Z");

function slot(over: Partial<TemplateSlot> & { id: string }): TemplateSlot {
  return {
    difficulty: "heroic",
    label: "LAST TWO KILL SPAM",
    scheduledAt: "2026-09-12T01:00:00Z",
    offerIds: [],
    ...over,
  };
}

describe("templateKey", () => {
  it("empareja la misma etiqueta escrita con distintos espacios y mayúsculas", () => {
    expect(templateKey("heroic", "LAST TWO KILL SPAM")).toBe(
      templateKey("heroic", "  last two   kill spam ")
    );
  });

  it("empareja una etiqueta con saltos de línea y notas pegadas", () => {
    const a = templateKey("heroic", "SAVED 5x 6/8 + 2x 8/8\nHeroic Venomous Abyss  This run starts 00:30");
    const b = templateKey("heroic", "SAVED 5x 6/8 + 2x 8/8 Heroic Venomous Abyss This run starts 00:30");
    expect(a).toBe(b);
    expect(a).not.toBeNull();
  });

  it("NO empareja la misma etiqueta en dificultades distintas", () => {
    expect(templateKey("normal", "LAST TWO KILL SPAM")).not.toBe(
      templateKey("heroic", "LAST TWO KILL SPAM")
    );
  });

  it("sin etiqueta no hay llave", () => {
    expect(templateKey("heroic", null)).toBeNull();
    expect(templateKey("heroic", "   ")).toBeNull();
  });
});

describe("buildSlotTemplates", () => {
  it("usa como modelo la corrida configurada más reciente", () => {
    const slots = [
      slot({ id: "vieja", scheduledAt: "2026-09-01T01:00:00Z", offerIds: ["a"] }),
      slot({ id: "nueva", scheduledAt: "2026-09-10T01:00:00Z", offerIds: ["b", "c"] }),
      slot({ id: "media", scheduledAt: "2026-09-05T01:00:00Z", offerIds: ["z"] }),
    ];
    const plantillas = buildSlotTemplates(slots);
    const key = templateKey("heroic", "LAST TWO KILL SPAM")!;
    expect(plantillas.get(key)?.offerIds).toEqual(["b", "c"]);
    expect(plantillas.get(key)?.sourceSlotId).toBe("nueva");
  });

  it("ignora las corridas sin contenidos y las sin etiqueta", () => {
    const slots = [
      slot({ id: "vacia", offerIds: [] }),
      slot({ id: "sin-label", label: null, offerIds: ["a"] }),
    ];
    expect(buildSlotTemplates(slots).size).toBe(0);
  });

  it("mantiene una plantilla por dificultad", () => {
    const slots = [
      slot({ id: "h", difficulty: "heroic", offerIds: ["h1"] }),
      slot({ id: "n", difficulty: "normal", offerIds: ["n1"] }),
    ];
    const plantillas = buildSlotTemplates(slots);
    expect(plantillas.size).toBe(2);
    expect(plantillas.get(templateKey("normal", "LAST TWO KILL SPAM")!)?.offerIds).toEqual(["n1"]);
  });
});

describe("suggestTemplates", () => {
  it("sugiere contenidos para las corridas futuras sin publicar", () => {
    const slots = [
      slot({ id: "modelo", scheduledAt: "2026-09-10T01:00:00Z", offerIds: ["a", "b"] }),
      slot({ id: "destino1", scheduledAt: "2026-09-12T01:00:00Z" }),
      slot({ id: "destino2", scheduledAt: "2026-09-13T01:00:00Z" }),
    ];
    const s = suggestTemplates(slots, AHORA);
    expect([...s.keys()].sort()).toEqual(["destino1", "destino2"]);
    expect(s.get("destino1")?.offerIds).toEqual(["a", "b"]);
    expect(s.get("destino1")?.sourceSlotId).toBe("modelo");
  });

  it("no toca las corridas que ya tienen contenidos", () => {
    const slots = [
      slot({ id: "modelo", scheduledAt: "2026-09-10T01:00:00Z", offerIds: ["a"] }),
      slot({ id: "ya-lista", scheduledAt: "2026-09-12T01:00:00Z", offerIds: ["z"] }),
    ];
    expect(suggestTemplates(slots, AHORA).has("ya-lista")).toBe(false);
  });

  it("no sugiere nada para una corrida que ya pasó", () => {
    const slots = [
      slot({ id: "modelo", scheduledAt: "2026-09-10T01:00:00Z", offerIds: ["a"] }),
      slot({ id: "pasada", scheduledAt: "2026-09-11T01:00:00Z" }),
    ];
    expect(suggestTemplates(slots, AHORA).size).toBe(0);
  });

  it("no cruza dificultades", () => {
    const slots = [
      slot({ id: "modelo-n", difficulty: "normal", scheduledAt: "2026-09-10T01:00:00Z", offerIds: ["n1"] }),
      slot({ id: "destino-h", difficulty: "heroic", scheduledAt: "2026-09-12T01:00:00Z" }),
    ];
    expect(suggestTemplates(slots, AHORA).size).toBe(0);
  });

  it("no sugiere nada si ninguna corrida de esa etiqueta fue configurada", () => {
    const slots = [
      slot({ id: "a", scheduledAt: "2026-09-12T01:00:00Z" }),
      slot({ id: "b", scheduledAt: "2026-09-13T01:00:00Z" }),
    ];
    expect(suggestTemplates(slots, AHORA).size).toBe(0);
  });

  it("resuelve el caso real de la agenda del 2026-09-11", () => {
    const slots: TemplateSlot[] = [
      slot({ id: "spam-pasada", scheduledAt: "2026-09-10T21:00:00Z", offerIds: ["o1"] }),
      slot({ id: "spam-hoy", scheduledAt: "2026-09-12T01:00:00Z", offerIds: ["o2"] }),
      slot({ id: "spam-1", scheduledAt: "2026-09-13T01:00:00Z" }),
      slot({ id: "spam-2", scheduledAt: "2026-09-13T23:30:00Z" }),
      slot({ id: "spam-3", scheduledAt: "2026-09-14T01:00:00Z" }),
      slot({ id: "ftp-modelo", label: "CAN BE FTP HEROIC UP TO 20MAN", scheduledAt: "2026-09-10T23:00:00Z", offerIds: ["o9"] }),
      slot({ id: "ftp-1", label: "CAN BE FTP HEROIC UP TO 20MAN", scheduledAt: "2026-09-12T23:00:00Z" }),
      slot({ id: "saved-1", label: "SAVED 5x 6/8 + 2x 8/8", scheduledAt: "2026-09-14T03:00:00Z" }),
    ];

    const s = suggestTemplates(slots, AHORA);
    expect([...s.keys()].sort()).toEqual(["ftp-1", "spam-1", "spam-2", "spam-3"]);
    expect(s.get("spam-1")?.offerIds).toEqual(["o2"]);
    expect(s.get("ftp-1")?.offerIds).toEqual(["o9"]);
    expect(s.has("saved-1")).toBe(false);
  });
});
