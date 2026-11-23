import { describe, expect, it } from "vitest";
import {
  computeAverageIlvl,
  computeGoalDebt,
  countCharactersForGoal,
  currentValueForRules,
  describeGoalRules,
  isGoalDebtSettled,
  settleGoalDebts,
  worstDebtForUser,
  goalDeadlineOffsetFromZoned,
  goalDeadlineZonedParts,
  ilvlGoalUsesMains,
  ilvlGoalTopN,
  resolveGoalDeadline,
  goalDebtSeverity,
  MINUTES_PER_WEEK,
  type GoalHistoryEntry,
  type MemberGoalDebt,
  GoalTarget,
} from "./goal-progress";

function goal(overrides: Partial<GoalTarget> = {}): GoalTarget {
  return {
    goalType: "characters",
    target: 14,
    minIlvl: null,
    onlyMains: false,
    deadlineOffsetMinutes: null,
    ...overrides,
  };
}

describe("countCharactersForGoal", () => {
  it("sin objetivo configurado, cuenta cualquier personaje", () => {
    const characters = [{ ilvl: 100, class: "Mage" }, { ilvl: null, class: null }];
    expect(countCharactersForGoal(characters, undefined, undefined)).toBe(2);
  });

  it("sin minIlvl ni onlyMains, cuenta todos los personajes", () => {
    const characters = [{ ilvl: 200, class: "Mage" }, { ilvl: null, class: "Priest" }];
    expect(countCharactersForGoal(characters, goal(), undefined)).toBe(2);
  });

  it("filtra por minIlvl (ejemplo real: Personajes=14, ilvl=285)", () => {
    const characters = [
      { ilvl: 290, class: "Paladin" },
      { ilvl: 285, class: "Paladin" },
      { ilvl: 284, class: "Paladin" },
      { ilvl: null, class: "Paladin" },
    ];
    expect(countCharactersForGoal(characters, goal({ minIlvl: 285 }), undefined)).toBe(2);
  });

  it("con onlyMains, excluye personajes de clase no-main", () => {
    const mainClasses = new Set(["Paladin", "Death Knight"]);
    const characters = [
      { ilvl: 300, class: "Paladin" },
      { ilvl: 300, class: "Mage" },
      { ilvl: 300, class: null },
    ];
    expect(countCharactersForGoal(characters, goal({ onlyMains: true }), mainClasses)).toBe(1);
  });

  it("combina minIlvl y onlyMains: debe cumplir los dos requisitos", () => {
    const mainClasses = new Set(["Paladin"]);
    const characters = [
      { ilvl: 290, class: "Paladin" },
      { ilvl: 280, class: "Paladin" },
      { ilvl: 290, class: "Mage" },
    ];
    expect(
      countCharactersForGoal(characters, goal({ minIlvl: 285, onlyMains: true }), mainClasses)
    ).toBe(1);
  });
});

describe("computeAverageIlvl", () => {
  it("promedia solo los personajes con ilvl cargado, redondeando", () => {
    const characters = [
      { ilvl: 290, class: "Paladin" },
      { ilvl: 285, class: "Mage" },
      { ilvl: null, class: "Priest" },
    ];
    expect(computeAverageIlvl(characters)).toBe(288);
  });

  it("sin personajes con ilvl, devuelve 0", () => {
    expect(computeAverageIlvl([{ ilvl: null, class: "Paladin" }])).toBe(0);
  });

  it("con mainClasses, promedia SOLO esas clases (ejemplo real: 2 mains a 290/292, 1 alt de otra clase a 250)", () => {
    const characters = [
      { ilvl: 290, class: "Paladin" },
      { ilvl: 292, class: "Death Knight" },
      { ilvl: 250, class: "Mage" },
    ];
    const mainClasses = new Set(["Paladin", "Death Knight"]);
    expect(computeAverageIlvl(characters, mainClasses)).toBe(291);
  });

  it("con mainClasses pero nadie de esas clases, devuelve 0 (no cae al promedio de todos)", () => {
    const characters = [{ ilvl: 290, class: "Mage" }];
    expect(computeAverageIlvl(characters, new Set(["Paladin"]))).toBe(0);
  });

  it("con topN, promedia SOLO los N de más ilvl (caso real: objetivo '5 personajes a 280', 6to personaje de ilvl 100 no debe bajar el promedio)", () => {
    const characters = [
      { ilvl: 285, class: "Paladin" },
      { ilvl: 282, class: "Mage" },
      { ilvl: 280, class: "Warrior" },
      { ilvl: 281, class: "Priest" },
      { ilvl: 283, class: "Druid" },
      { ilvl: 100, class: "Hunter" },
    ];
    expect(computeAverageIlvl(characters, undefined, 5)).toBe(282);
  });

  it("con topN mayor a la cantidad de personajes, no corta nada", () => {
    const characters = [
      { ilvl: 290, class: "Paladin" },
      { ilvl: 280, class: "Mage" },
    ];
    expect(computeAverageIlvl(characters, undefined, 10)).toBe(285);
  });

  it("topN se aplica DESPUÉS del filtro de mainClasses, no antes", () => {
    const characters = [
      { ilvl: 300, class: "Paladin" },
      { ilvl: 200, class: "Paladin" },
      { ilvl: 500, class: "Mage" },
    ];
    const mainClasses = new Set(["Paladin"]);
    expect(computeAverageIlvl(characters, mainClasses, 1)).toBe(300);
  });

  it("sin topN, sigue promediando el pool entero (comportamiento de siempre)", () => {
    const characters = [
      { ilvl: 285, class: "Paladin" },
      { ilvl: 100, class: "Hunter" },
    ];
    expect(computeAverageIlvl(characters)).toBe(193);
  });
});

describe("ilvlGoalTopN", () => {
  it("sin objetivo 'characters' configurado, no hay tope", () => {
    expect(ilvlGoalTopN([goal({ goalType: "avg_ilvl" })])).toBeUndefined();
  });

  it("con 'characters' configurado, el tope es su target", () => {
    expect(ilvlGoalTopN([goal({ target: 5 })])).toBe(5);
  });
});

describe("ilvlGoalUsesMains", () => {
  it("sin objetivo 'characters' configurado, no hereda nada", () => {
    expect(ilvlGoalUsesMains([goal({ goalType: "avg_ilvl" })])).toBe(false);
  });

  it("con 'characters' configurado y onlyMains apagado, no hereda", () => {
    expect(ilvlGoalUsesMains([goal({ onlyMains: false })])).toBe(false);
  });

  it("con 'characters' configurado y onlyMains prendido, hereda", () => {
    expect(ilvlGoalUsesMains([goal({ onlyMains: true })])).toBe(true);
  });
});

const W = {
  actual: "2026-08-11",
  hace1: "2026-08-04",
  hace2: "2026-07-28",
  hace3: "2026-07-21",
  hace4: "2026-07-14",
  hace5: "2026-07-07",
};

function row(
  weekStart: string,
  met: boolean,
  goalType: GoalHistoryEntry["goalType"] = "characters",
  overrides: Partial<GoalHistoryEntry> = {}
): GoalHistoryEntry {
  return { goalType, weekStart, met, target: 5, minIlvl: null, onlyMains: false, topN: null, ...overrides };
}

describe("computeGoalDebt", () => {
  it("sin historial no hay deuda", () => {
    expect(computeGoalDebt([], "characters")).toBeNull();
  });

  it("cuenta las semanas incumplidas desde la más reciente", () => {
    const rows = [row(W.actual, false), row(W.hace1, false), row(W.hace2, false)];
    expect(computeGoalDebt(rows, "characters")?.weeks).toBe(3);
  });

  it("corta en la primera semana cumplida: lo anterior ya está saldado", () => {
    const rows = [row(W.actual, false), row(W.hace1, false), row(W.hace2, true), row(W.hace3, false)];
    expect(computeGoalDebt(rows, "characters")?.weeks).toBe(2);
  });

  it("la semana más reciente cumplida borra la deuda por completo", () => {
    const rows = [row(W.actual, true), row(W.hace1, false), row(W.hace2, false), row(W.hace3, false)];
    expect(computeGoalDebt(rows, "characters")).toBeNull();
  });

  it("un HUECO ya no corta la cuenta: una semana sin cerrar no borra la sanción", () => {
    const rows = [row(W.actual, false), row(W.hace2, false), row(W.hace3, false)];
    expect(computeGoalDebt(rows, "characters")?.weeks).toBe(3);
  });

  it("no depende del orden en el que lleguen las filas", () => {
    const rows = [row(W.hace2, false), row(W.actual, false), row(W.hace1, false)];
    expect(computeGoalDebt(rows, "characters")?.weeks).toBe(3);
  });

  it("cada objetivo lleva su propia cuenta, sin mezclarse con el otro", () => {
    const rows = [
      row(W.actual, false, "characters"),
      row(W.hace1, false, "characters"),
      row(W.actual, true, "avg_ilvl"),
      row(W.hace1, false, "avg_ilvl"),
    ];
    expect(computeGoalDebt(rows, "characters")?.weeks).toBe(2);
    expect(computeGoalDebt(rows, "avg_ilvl")).toBeNull();
  });

  it("la meta pendiente es la de la semana incumplida MÁS RECIENTE", () => {
    const rows = [
      row(W.actual, false, "characters", { target: 7, minIlvl: 300 }),
      row(W.hace1, false, "characters", { target: 5, minIlvl: 295 }),
    ];
    const debt = computeGoalDebt(rows, "characters");
    expect({ target: debt?.target, minIlvl: debt?.minIlvl, weeks: debt?.weeks }).toEqual({
      target: 7,
      minIlvl: 300,
      weeks: 2,
    });
  });

  it("guarda desde qué semana viene arrastrando la deuda", () => {
    const rows = [row(W.actual, false), row(W.hace1, false), row(W.hace2, false)];
    const debt = computeGoalDebt(rows, "characters");
    expect({ since: debt?.sinceWeek, last: debt?.lastWeek }).toEqual({ since: W.hace2, last: W.actual });
  });
});

describe("goalDebtSeverity", () => {
  it("sin semanas debiendo no muestra nada", () => {
    expect(goalDebtSeverity(0)).toBe("none");
  });

  it("escala 1 amarillo -> 2 naranja -> 3+ rojo", () => {
    expect(goalDebtSeverity(1)).toBe("leve");
    expect(goalDebtSeverity(2)).toBe("medio");
    expect(goalDebtSeverity(3)).toBe("grave");
    expect(goalDebtSeverity(12)).toBe("grave");
  });
});

describe("isGoalDebtSettled", () => {
  const characters = [
    { ilvl: 300, class: "Mage" },
    { ilvl: 298, class: "Warlock" },
    { ilvl: 296, class: "Priest" },
    { ilvl: 250, class: "Rogue" },
  ];

  function debt(overrides: Partial<MemberGoalDebt> = {}): MemberGoalDebt {
    return {
      userId: "u1",
      goalType: "characters",
      weeks: 2,
      target: 3,
      minIlvl: 295,
      onlyMains: false,
      topN: null,
      sinceWeek: W.hace1,
      lastWeek: W.actual,
      ...overrides,
    };
  }

  it("se salda cuando alcanza la meta que debía, sin esperar el cierre semanal", () => {
    expect(isGoalDebtSettled(debt(), characters, undefined)).toBe(true);
  });

  it("sigue abierta si todavía no llega", () => {
    expect(isGoalDebtSettled(debt({ target: 4 }), characters, undefined)).toBe(false);
  });

  it("respeta el piso de ilvl de la deuda, no el del objetivo vigente", () => {
    expect(isGoalDebtSettled(debt({ minIlvl: 300, target: 2 }), characters, undefined)).toBe(false);
  });

  it("respeta 'solo clases main' de la deuda", () => {
    const mains = new Set(["Mage"]);
    expect(isGoalDebtSettled(debt({ onlyMains: true, target: 2 }), characters, mains)).toBe(false);
    expect(isGoalDebtSettled(debt({ onlyMains: true, target: 1 }), characters, mains)).toBe(true);
  });

  it("una deuda de ilvl promedio se salda contra el promedio de los topN de la deuda", () => {
    const ilvlDebt = debt({ goalType: "avg_ilvl", target: 299, minIlvl: null, topN: 2 });
    expect(isGoalDebtSettled(ilvlDebt, characters, undefined)).toBe(true);
    expect(isGoalDebtSettled({ ...ilvlDebt, topN: null }, characters, undefined)).toBe(false);
  });
});

describe("settleGoalDebts", () => {
  it("saca de la lista a quien ya alcanzó lo que debía y deja al resto", () => {
    const alDia: MemberGoalDebt = {
      userId: "al-dia",
      goalType: "characters",
      weeks: 1,
      target: 2,
      minIlvl: null,
      onlyMains: false,
      topN: null,
      sinceWeek: W.actual,
      lastWeek: W.actual,
    };
    const debiendo: MemberGoalDebt = { ...alDia, userId: "debiendo", target: 5, weeks: 3 };
    const characters = new Map([
      ["al-dia", [{ ilvl: 300, class: "Mage" }, { ilvl: 290, class: "Priest" }]],
      ["debiendo", [{ ilvl: 300, class: "Mage" }]],
    ]);
    const abiertas = settleGoalDebts([alDia, debiendo], characters, new Map());
    expect(abiertas.map((d) => d.userId)).toEqual(["debiendo"]);
  });
});

describe("worstDebtForUser", () => {
  const base = {
    goalType: "characters" as const,
    target: 5,
    minIlvl: null,
    onlyMains: false,
    topN: null,
    sinceWeek: W.hace2,
    lastWeek: W.actual,
  };

  it("un solo tag por miembro: gana la deuda de más semanas", () => {
    const debts: MemberGoalDebt[] = [
      { ...base, userId: "u1", weeks: 1 },
      { ...base, userId: "u1", goalType: "avg_ilvl", weeks: 3 },
      { ...base, userId: "u2", weeks: 9 },
    ];
    expect(worstDebtForUser(debts, "u1")?.weeks).toBe(3);
    expect(worstDebtForUser(debts, "sin-deuda")).toBeNull();
  });
});

describe("currentValueForRules y describeGoalRules", () => {
  const characters = [
    { ilvl: 300, class: "Mage" },
    { ilvl: 290, class: "Priest" },
  ];

  it("mide personajes con las reglas dadas", () => {
    const reglas = { target: 2, minIlvl: 295, onlyMains: false, topN: null };
    expect(currentValueForRules("characters", characters, reglas, undefined)).toBe(1);
  });

  it("escribe la meta en palabras, con sus reglas", () => {
    expect(describeGoalRules("characters", { target: 5, minIlvl: 295, onlyMains: false, topN: null })).toBe(
      "5 personajes con ilvl 295+"
    );
    expect(describeGoalRules("characters", { target: 1, minIlvl: null, onlyMains: true, topN: null })).toBe(
      "1 personaje, solo clases main"
    );
    expect(describeGoalRules("avg_ilvl", { target: 307, minIlvl: null, onlyMains: false, topN: 5 })).toBe(
      "ilvl promedio 307 (los 5 de más ilvl)"
    );
  });
});

describe("resolveGoalDeadline", () => {
  const weekStart = new Date("2026-08-11T15:00:00Z");

  it("sin offset vence al arrancar la semana siguiente", () => {
    expect(resolveGoalDeadline(weekStart, null).toISOString()).toBe("2026-08-18T15:00:00.000Z");
    expect(resolveGoalDeadline(weekStart, MINUTES_PER_WEEK).toISOString()).toBe("2026-08-18T15:00:00.000Z");
  });

  it("con offset acorta la semana al horario configurado", () => {
    expect(resolveGoalDeadline(weekStart, 180).toISOString()).toBe("2026-08-11T18:00:00.000Z");
    expect(resolveGoalDeadline(weekStart, 60 * 60).toISOString()).toBe("2026-08-14T03:00:00.000Z");
  });
});

describe("deadline en hora de Chile <-> offset contra el reset", () => {
  const weekStart = new Date("2026-08-11T15:00:00Z");

  it("convierte 'el martes del reinicio a las 18:00 hora de Chile' a minutos desde el reset", () => {
    expect(goalDeadlineOffsetFromZoned(weekStart, 0, "18:00")).toBe(7 * 60);
  });

  it("cuenta los días de calendario chilenos, no bloques de 24h desde el reset", () => {
    expect(goalDeadlineOffsetFromZoned(weekStart, 2, "22:30")).toBe(2 * 24 * 60 + 11 * 60 + 30);
  });

  it("da la vuelta completa: offset -> día+hora en Chile -> el mismo offset", () => {
    for (const [dayIndex, time] of [
      [0, "18:00"],
      [1, "09:15"],
      [4, "23:45"],
      [6, "11:00"],
    ] as const) {
      const offset = goalDeadlineOffsetFromZoned(weekStart, dayIndex, time);
      const parts = goalDeadlineZonedParts(weekStart, offset);
      expect({ dayIndex: parts.dayIndex, time: parts.time }).toEqual({ dayIndex, time });
    }
  });

  it("sin offset (semana completa) el vencimiento cae en el reinicio siguiente", () => {
    const parts = goalDeadlineZonedParts(weekStart, null);
    expect(parts.dayIndex).toBe(7);
    expect(parts.dateKey).toBe("2026-08-18");
  });

  it("sigue el horario de verano de Chile en vez de asumir un offset fijo", () => {
    const veranoWeekStart = new Date("2027-01-12T15:00:00Z");
    expect(goalDeadlineOffsetFromZoned(veranoWeekStart, 0, "18:00")).toBe(6 * 60);
  });
});
