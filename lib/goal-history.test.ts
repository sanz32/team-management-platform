import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createFakeSupabase } from "./test-utils/fake-supabase";
import {
  closeCurrentGoalWeekNow,
  closeElapsedGoalWeeksIfStale,
  getGoalDebtsByUser,
  isCurrentGoalWeekClosed,
  previewCurrentGoalWeekClose,
} from "./goal-history";
import { getLockoutWeekStart } from "./wow-reset";

type Fake = ReturnType<typeof createFakeSupabase>;

function asClient(fake: Fake) {
  return fake as unknown as Parameters<typeof closeElapsedGoalWeeksIfStale>[0];
}

const ANA = "user-ana";
const BETO = "user-beto";
const BORRADO = "user-borrado";

function seed(overrides: Record<string, Record<string, unknown>[]> = {}) {
  return createFakeSupabase({
    guild_goals: [
      { goal_type: "characters", target: 2, min_ilvl: null, only_mains: false, deadline_offset_minutes: 180 },
    ],
    app_users: [
      { id: ANA, removed_at: null },
      { id: BETO, removed_at: null },
      { id: BORRADO, removed_at: "2026-01-01T00:00:00Z" },
    ],
    characters: [
      { user_id: ANA, ilvl: 300, class: "Mage" },
      { user_id: ANA, ilvl: 290, class: "Mage" },
      { user_id: BETO, ilvl: 280, class: "Warrior" },
      { user_id: BORRADO, ilvl: 300, class: "Priest" },
    ],
    user_main_classes: [{ user_id: ANA, class: "Mage", source: "auto" }],
    guild_goal_history: [],
    goal_close_state: [],
    guild_goal_weeks: [],
    ...overrides,
  });
}

function mitadDeSemana(): Date {
  return new Date(getLockoutWeekStart("us").getTime() + 3.5 * 24 * 60 * 60 * 1000);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(mitadDeSemana());
});

afterEach(() => {
  vi.useRealTimers();
});

describe("closeElapsedGoalWeeksIfStale", () => {
  it("cierra la semana en curso cuando su deadline ya pasó, anotando quién llegó y quién no", async () => {
    const fake = seed();
    await closeElapsedGoalWeeksIfStale(asClient(fake));

    const semanaActual = getLockoutWeekStart("us").toISOString().slice(0, 10);
    const rows = fake._tables.guild_goal_history.filter((r) => r.week_start === semanaActual);
    expect(rows).toHaveLength(2);

    const ana = rows.find((r) => r.user_id === ANA);
    expect(ana).toMatchObject({ goal_type: "characters", target: 2, current_value: 2, met: true });

    const beto = rows.find((r) => r.user_id === BETO);
    expect(beto).toMatchObject({ current_value: 1, met: false });
  });

  it("no anota a un miembro con borrado suave", async () => {
    const fake = seed();
    await closeElapsedGoalWeeksIfStale(asClient(fake));
    expect(fake._tables.guild_goal_history.some((r) => r.user_id === BORRADO)).toBe(false);
  });

  it("respeta el ilvl mínimo del objetivo al calcular el valor congelado", async () => {
    const fake = seed({
      guild_goals: [
        { goal_type: "characters", target: 2, min_ilvl: 295, only_mains: false, deadline_offset_minutes: 180 },
      ],
    });
    await closeElapsedGoalWeeksIfStale(asClient(fake));

    const ana = fake._tables.guild_goal_history.find((r) => r.user_id === ANA);
    expect(ana).toMatchObject({ current_value: 1, met: false });
  });

  it("una segunda llamada inmediata no vuelve a hacer el trabajo pesado", async () => {
    const fake = seed();
    await closeElapsedGoalWeeksIfStale(asClient(fake));
    const despuesDelPrimero = fake._tables.guild_goal_history.length;

    const spy = vi.spyOn(fake, "from");
    await closeElapsedGoalWeeksIfStale(asClient(fake));

    expect(spy.mock.calls.map((c) => c[0])).toEqual(["goal_close_state"]);
    expect(fake._tables.guild_goal_history).toHaveLength(despuesDelPrimero);
    spy.mockRestore();
  });

  it("pasado el TTL vuelve a chequear, pero no duplica una semana ya cerrada", async () => {
    const fake = seed();
    await closeElapsedGoalWeeksIfStale(asClient(fake));
    const despuesDelPrimero = fake._tables.guild_goal_history.length;

    vi.setSystemTime(new Date(Date.now() + 20 * 60 * 1000));
    await closeElapsedGoalWeeksIfStale(asClient(fake));

    expect(fake._tables.guild_goal_history).toHaveLength(despuesDelPrimero);
  });

  it("un objetivo de semana completa no se cierra a mitad de semana", async () => {
    const fake = seed({
      guild_goals: [
        { goal_type: "characters", target: 2, min_ilvl: null, only_mains: false, deadline_offset_minutes: null },
      ],
    });
    await closeElapsedGoalWeeksIfStale(asClient(fake));

    const semanaActual = getLockoutWeekStart("us").toISOString().slice(0, 10);
    expect(fake._tables.guild_goal_history.some((r) => r.week_start === semanaActual)).toBe(false);
  });

  it("un objetivo de semana completa SÍ cierra la semana anterior (su deadline es el reinicio de esta)", async () => {
    const fake = seed({
      guild_goals: [
        { goal_type: "characters", target: 2, min_ilvl: null, only_mains: false, deadline_offset_minutes: null },
      ],
    });
    await closeElapsedGoalWeeksIfStale(asClient(fake));

    const semanaAnterior = new Date(getLockoutWeekStart("us").getTime() - 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const rows = fake._tables.guild_goal_history.filter((r) => r.week_start === semanaAnterior);
    expect(rows).toHaveLength(2);
  });

  it("sin ningún objetivo configurado no escribe historial", async () => {
    const fake = seed({ guild_goals: [] });
    await closeElapsedGoalWeeksIfStale(asClient(fake));
    expect(fake._tables.guild_goal_history).toHaveLength(0);
  });
});

describe("getGoalDebtsByUser", () => {
  it("devuelve solo las deudas abiertas, una por miembro y objetivo", async () => {
    const semana = (atras: number) =>
      new Date(getLockoutWeekStart("us").getTime() - atras * 7 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);

    const fake = seed({
      guild_goal_history: [
        { user_id: ANA, goal_type: "characters", week_start: semana(0), met: false, target: 2, min_ilvl: 295 },
        { user_id: ANA, goal_type: "characters", week_start: semana(1), met: false, target: 2, min_ilvl: 295 },
        { user_id: ANA, goal_type: "characters", week_start: semana(2), met: true, target: 2, min_ilvl: 295 },
        { user_id: BETO, goal_type: "characters", week_start: semana(0), met: true, target: 2, min_ilvl: 295 },
      ],
    });

    const debts = await getGoalDebtsByUser(asClient(fake));
    expect(debts).toHaveLength(1);
    expect(debts[0]).toMatchObject({
      userId: ANA,
      goalType: "characters",
      weeks: 2,
      target: 2,
      minIlvl: 295,
    });
  });
});

describe("cierre manual (\"Cerrar ahora\")", () => {
  function seedSemanaCompleta() {
    return seed({
      guild_goals: [
        { goal_type: "characters", target: 2, min_ilvl: null, only_mains: false, deadline_offset_minutes: null },
      ],
    });
  }

  it("cierra la semana en curso aunque su deadline todavía no haya llegado", async () => {
    const fake = seedSemanaCompleta();
    const semanaActual = getLockoutWeekStart("us").toISOString().slice(0, 10);

    await closeElapsedGoalWeeksIfStale(asClient(fake));
    expect(fake._tables.guild_goal_history.some((r) => r.week_start === semanaActual)).toBe(false);

    const res = await closeCurrentGoalWeekNow(asClient(fake));
    expect(res.closed).toBe(true);
    const rows = fake._tables.guild_goal_history.filter((r) => r.week_start === semanaActual);
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.user_id === ANA)).toMatchObject({ met: true, current_value: 2 });
    expect(rows.find((r) => r.user_id === BETO)).toMatchObject({ met: false, current_value: 1 });
  });

  it("congela la hora REAL del cierre, no el vencimiento teórico de la semana", async () => {
    const fake = seedSemanaCompleta();
    await closeCurrentGoalWeekNow(asClient(fake));
    const fila = fake._tables.guild_goal_history[0];
    expect(fila.deadline_at).toBe(new Date().toISOString());
  });

  it("no vuelve a cerrar una semana ya cerrada", async () => {
    const fake = seedSemanaCompleta();
    await closeCurrentGoalWeekNow(asClient(fake));
    const despues = fake._tables.guild_goal_history.length;

    const segundo = await closeCurrentGoalWeekNow(asClient(fake));
    expect(segundo).toMatchObject({ closed: false, alreadyClosed: true });
    expect(fake._tables.guild_goal_history).toHaveLength(despues);
  });

  it("el cierre automático posterior no vuelve a evaluar la semana ya cerrada a mano", async () => {
    const fake = seedSemanaCompleta();
    const semanaActual = getLockoutWeekStart("us").toISOString().slice(0, 10);
    await closeCurrentGoalWeekNow(asClient(fake));
    const deLaActual = () => fake._tables.guild_goal_history.filter((r) => r.week_start === semanaActual);
    const congeladas = deLaActual().map((r) => `${r.user_id}:${r.current_value}:${r.met}:${r.deadline_at}`);

    vi.setSystemTime(new Date(Date.now() + 20 * 60 * 1000));
    await closeElapsedGoalWeeksIfStale(asClient(fake));

    expect(deLaActual().map((r) => `${r.user_id}:${r.current_value}:${r.met}:${r.deadline_at}`)).toEqual(
      congeladas
    );
  });

  it("sin ningún objetivo configurado no cierra nada", async () => {
    const fake = seed({ guild_goals: [] });
    const res = await closeCurrentGoalWeekNow(asClient(fake));
    expect(res).toMatchObject({ closed: false, alreadyClosed: false, summary: null });
    expect(fake._tables.guild_goal_history).toHaveLength(0);
  });

  it("el resumen dice a cuántos evaluó y quién no llegó, para la confirmación del RL", async () => {
    const fake = seedSemanaCompleta();
    const res = await closeCurrentGoalWeekNow(asClient(fake));
    expect(res.summary).toMatchObject({ evaluated: 2 });
    expect(res.summary?.goals[0]).toMatchObject({ met: 1, total: 2, unmetUserIds: [BETO] });
  });

  it("la previsualización no escribe nada", async () => {
    const fake = seedSemanaCompleta();
    const preview = await previewCurrentGoalWeekClose(asClient(fake));
    expect(preview.alreadyClosed).toBe(false);
    expect(preview.summary?.goals[0]).toMatchObject({ met: 1, total: 2, unmetUserIds: [BETO] });
    expect(fake._tables.guild_goal_history).toHaveLength(0);
  });

  it("isCurrentGoalWeekClosed refleja el estado antes y después", async () => {
    const fake = seedSemanaCompleta();
    expect(await isCurrentGoalWeekClosed(asClient(fake))).toBe(false);
    await closeCurrentGoalWeekNow(asClient(fake));
    expect(await isCurrentGoalWeekClosed(asClient(fake))).toBe(true);
  });
});

describe("el objetivo sellado manda sobre el vigente", () => {
  it("cierra la semana con el sello de ESA semana, no con la meta de hoy", async () => {
    const semanaActual = getLockoutWeekStart("us").toISOString().slice(0, 10);
    const fake = seed({
      guild_goals: [
        { goal_type: "characters", target: 5, min_ilvl: null, only_mains: false, deadline_offset_minutes: 180 },
      ],
      guild_goal_weeks: [
        {
          week_start: semanaActual,
          goal_type: "characters",
          target: 1,
          min_ilvl: null,
          only_mains: false,
          top_n: null,
          deadline_offset_minutes: 180,
        },
      ],
    });

    await closeElapsedGoalWeeksIfStale(asClient(fake));

    const rows = fake._tables.guild_goal_history.filter((r) => r.week_start === semanaActual);
    expect(rows.find((r) => r.user_id === BETO)).toMatchObject({ target: 1, met: true });
  });

  it("sella la semana en curso con el objetivo vigente cuando nadie la había sellado", async () => {
    const fake = seed();
    await closeElapsedGoalWeeksIfStale(asClient(fake));

    const semanaActual = getLockoutWeekStart("us").toISOString().slice(0, 10);
    expect(fake._tables.guild_goal_weeks).toContainEqual(
      expect.objectContaining({ week_start: semanaActual, goal_type: "characters", target: 2 })
    );
  });

  it("guarda en el historial las reglas con las que evaluó cada fila", async () => {
    const fake = seed({
      guild_goals: [
        { goal_type: "characters", target: 2, min_ilvl: 295, only_mains: false, deadline_offset_minutes: 180 },
      ],
    });
    await closeElapsedGoalWeeksIfStale(asClient(fake));

    const ana = fake._tables.guild_goal_history.find((r) => r.user_id === ANA);
    expect(ana).toMatchObject({ min_ilvl: 295, only_mains: false });
  });
});
