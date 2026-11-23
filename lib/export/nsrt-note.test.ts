import { describe, expect, it } from "vitest";
import {
  generateNsrtBossNote,
  generateNsrtFullNightNote,
  type NsrtBossNoteInput,
} from "./nsrt-note";

const chimaerus: NsrtBossNoteInput = {
  bossName: "Chimaerus",
  encounterId: 3306,
  difficulty: "Mythic",
  pullDurationMs: 392_000,
  assignments: [
    { spellId: 370960, spellName: "Emerald Communion", timestampMs: 47_000, characterName: "Neryx", phase: 1 },
    { spellId: 6940, spellName: "Blessing of Sacrifice", timestampMs: 13_400, characterName: "Arden", phase: 1 },
    { spellId: 115310, spellName: "Revival", timestampMs: 125_000, characterName: "Quill", phase: 2 },
  ],
};

describe("generateNsrtBossNote", () => {
  it("arma la cabecera con EncounterID+Difficulty+Name, un recordatorio con ph por línea ordenado por tiempo, y el bloque legible", () => {
    expect(generateNsrtBossNote(chimaerus)).toBe(
      [
        "EncounterID:3306;Difficulty:Mythic;Name:Chimaerus;",
        "time:13;ph:1;tag:Arden;spellid:6940;",
        "time:47;ph:1;tag:Neryx;spellid:370960;",
        "time:125;ph:2;tag:Quill;spellid:115310;",
        "",
        "Chimaerus (pull 6:32)",
        "0:13 Blessing of Sacrifice - Arden",
        "0:47 Emerald Communion - Neryx",
        "2:05 Revival - Quill",
      ].join("\n")
    );
  });

  it("omite EncounterID/Difficulty de la cabecera cuando no se conocen, en vez de inventarlos", () => {
    const note = generateNsrtBossNote({ ...chimaerus, encounterId: null, difficulty: null });
    expect(note.split("\n")[0]).toBe("Name:Chimaerus;");
  });

  it("omite la duración del pull cuando no se conoce", () => {
    const note = generateNsrtBossNote({ ...chimaerus, pullDurationMs: null });
    expect(note).toContain("\nChimaerus\n");
    expect(note).not.toContain("pull");
  });

  it("devuelve string vacío si el plan no tiene ninguna asignación con personaje", () => {
    expect(
      generateNsrtBossNote({ bossName: "Chimaerus", encounterId: 3306, difficulty: "Mythic", pullDurationMs: 392_000, assignments: [] })
    ).toBe("");
  });
});

describe("generateNsrtFullNightNote", () => {
  it("concatena las notas de varios jefes separadas por una línea en blanco", () => {
    const dimensius: NsrtBossNoteInput = {
      bossName: "Dimensius",
      encounterId: 3135,
      difficulty: "Mythic",
      pullDurationMs: null,
      assignments: [
        { spellId: 64843, spellName: "Divine Hymn", timestampMs: 60_000, characterName: "Tiko", phase: 1 },
      ],
    };

    expect(generateNsrtFullNightNote([chimaerus, dimensius])).toBe(
      `${generateNsrtBossNote(chimaerus)}\n\n${generateNsrtBossNote(dimensius)}`
    );
  });

  it("saltea los jefes sin asignaciones en vez de dejar una cabecera huérfana", () => {
    const vacio: NsrtBossNoteInput = { bossName: "Nexus-King", encounterId: null, difficulty: null, pullDurationMs: null, assignments: [] };

    expect(generateNsrtFullNightNote([vacio, chimaerus, vacio])).toBe(generateNsrtBossNote(chimaerus));
  });

  it("devuelve string vacío si ningún jefe tiene asignaciones", () => {
    expect(
      generateNsrtFullNightNote([{ bossName: "Nexus-King", encounterId: null, difficulty: null, pullDurationMs: null, assignments: [] }])
    ).toBe("");
  });
});
