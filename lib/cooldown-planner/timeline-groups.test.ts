import { describe, expect, it } from "vitest";
import { phaseBandsFromTransitions, groupBossEvents, groupCastsByPerson } from "./timeline-groups";

function cast(
  personLabel: string,
  personRoleLabel: string,
  spellId: number,
  timestampMs: number,
  spellName = `Spell ${spellId}`
) {
  return {
    id: `${personLabel}-${spellId}-${timestampMs}`,
    spellId,
    spellName,
    iconUrl: null,
    timestampMs,
    personLabel,
    personRoleLabel,
    laneColor: "#C41F3B",
  };
}

describe("groupCastsByPerson", () => {
  it("separa dos personajes con la misma clase+spec en grupos numerados", () => {
    const groups = groupCastsByPerson([
      cast("Gorrak", "Blood Death Knight", 49028, 10_000),
      cast("Mortlan", "Blood Death Knight", 49028, 12_000),
    ]);

    expect(groups.map((g) => g.displayLabel)).toEqual(["Blood Death Knight 1", "Blood Death Knight 2"]);
    expect(groups.map((g) => g.personLabel)).toEqual(["Gorrak", "Mortlan"]);
  });

  it("no numera cuando hay un solo personaje de ese rol", () => {
    const groups = groupCastsByPerson([
      cast("Gorrak", "Blood Death Knight", 49028, 10_000),
      cast("Fernwhisper", "Restoration Druid", 740, 20_000),
    ]);

    expect(groups.map((g) => g.displayLabel)).toEqual(["Blood Death Knight", "Restoration Druid"]);
  });

  it("agrupa los casts de un personaje en una fila por spell, ordenadas por su primer cast", () => {
    const groups = groupCastsByPerson([
      cast("Fernwhisper", "Restoration Druid", 740, 90_000, "Tranquility"),
      cast("Fernwhisper", "Restoration Druid", 33891, 15_000, "Incarnation"),
      cast("Fernwhisper", "Restoration Druid", 740, 30_000, "Tranquility"),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].castCount).toBe(3);
    expect(groups[0].rows.map((r) => r.spellName)).toEqual(["Incarnation", "Tranquility"]);
    expect(groups[0].rows[1].casts.map((c) => c.timestampMs)).toEqual([30_000, 90_000]);
  });

  it("mantiene juntos y en orden a los tres personajes del mismo rol", () => {
    const groups = groupCastsByPerson([
      cast("Ceres", "Vengeance Demon Hunter", 187827, 5_000),
      cast("Aria", "Vengeance Demon Hunter", 187827, 5_000),
      cast("Fernwhisper", "Restoration Druid", 740, 5_000),
      cast("Bela", "Vengeance Demon Hunter", 187827, 5_000),
    ]);

    expect(groups.map((g) => `${g.displayLabel} (${g.personLabel})`)).toEqual([
      "Restoration Druid (Fernwhisper)",
      "Vengeance Demon Hunter 1 (Aria)",
      "Vengeance Demon Hunter 2 (Bela)",
      "Vengeance Demon Hunter 3 (Ceres)",
    ]);
  });
});

describe("groupBossEvents", () => {
  it("crea una fila por ability, ordenada por su primera aparición, con color de la paleta y el ícono de su primer evento", () => {
    const rows = groupBossEvents(
      [
        { id: "a", spellName: "Total Eclipse", timestampMs: 120_000, iconUrl: "eclipse-late.jpg" },
        { id: "b", spellName: "Dark Quasar", timestampMs: 6_000, iconUrl: "quasar.jpg" },
        { id: "c", spellName: "Total Eclipse", timestampMs: 60_000, iconUrl: "eclipse-first.jpg" },
      ],
      ["#aaa", "#bbb"]
    );

    expect(rows.map((r) => r.spellName)).toEqual(["Dark Quasar", "Total Eclipse"]);
    expect(rows.map((r) => r.color)).toEqual(["#aaa", "#bbb"]);
    expect(rows.map((r) => r.iconUrl)).toEqual(["quasar.jpg", "eclipse-first.jpg"]);
    expect(rows[1].events.map((e) => e.timestampMs)).toEqual([60_000, 120_000]);
  });

  it("recicla la paleta cuando hay más abilities que colores", () => {
    const rows = groupBossEvents(
      [
        { id: "a", spellName: "Uno", timestampMs: 1, iconUrl: null },
        { id: "b", spellName: "Dos", timestampMs: 2, iconUrl: null },
        { id: "c", spellName: "Tres", timestampMs: 3, iconUrl: null },
      ],
      ["#aaa", "#bbb"]
    );

    expect(rows.map((r) => r.color)).toEqual(["#aaa", "#bbb", "#aaa"]);
  });
});

describe("phaseBandsFromTransitions", () => {
  it("no inventa fases cuando Warcraft Logs no las informa", () => {
    expect(phaseBandsFromTransitions([], 300_000)).toEqual([]);
  });

  it("genera labels genéricos numerando fases e intermisiones por separado", () => {
    const bands = phaseBandsFromTransitions(
      [
        { ms: 0, isIntermission: false },
        { ms: 90_000, isIntermission: true },
        { ms: 150_000, isIntermission: false },
        { ms: 200_000, isIntermission: true },
        { ms: 250_000, isIntermission: false },
      ],
      300_000
    );

    expect(bands).toEqual([
      { label: "Fase 1", startMs: 0, endMs: 90_000, isIntermission: false },
      { label: "Intermisión 1", startMs: 90_000, endMs: 150_000, isIntermission: true },
      { label: "Fase 2", startMs: 150_000, endMs: 200_000, isIntermission: false },
      { label: "Intermisión 2", startMs: 200_000, endMs: 250_000, isIntermission: true },
      { label: "Fase 3", startMs: 250_000, endMs: 300_000, isIntermission: false },
    ]);
  });

  it("ordena las transiciones aunque lleguen desordenadas", () => {
    const bands = phaseBandsFromTransitions(
      [
        { ms: 150_000, isIntermission: false },
        { ms: 0, isIntermission: false },
        { ms: 90_000, isIntermission: true },
      ],
      300_000
    );
    expect(bands.map((b) => b.startMs)).toEqual([0, 90_000, 150_000]);
  });
});
