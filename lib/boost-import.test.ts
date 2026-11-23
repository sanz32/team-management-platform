import { describe, it, expect } from "vitest";
import {
  parseBoostCatalog,
  offerKey,
  parseBoostSchedule,
  parseBoostRunsJson,
  slotKey,
} from "./boost-import";

const PEGADO = `
🔸 Venomous Abyss + Tidebound Grotto
18 services available

Heroic Raids
11 services

🔸 Tidebound Grotto SAVED
Hot
1/1 - Free Roll - No Item Reserve

Price
100,000 gold

Venomous Abyss 6/8 UNSAVED + Last TWO SAVED
Hot
First 6/8 Bosses Unsaved 4-5 itens, Last Two Saved

Price
1,350,000 gold

Normal Raids
7 services

🔸 Tidebound Grotto SAVED
Hot
1/1 - Free Roll - No Item Reserve

Price
50,000 gold

🔸VIP, ATP & FP
29 services available

Mythic Raids
6 services

🔸Venomous Abyss 2/8 FP
Hot
All items you can equip are yours - Nek'zali the Soulcoiler - The Lost Explorers

Price
8,650,000 gold
`;

describe("parseBoostCatalog", () => {
  const { offers, warnings } = parseBoostCatalog(PEGADO);

  it("lee todos los paquetes del pegado", () => {
    expect(offers).toHaveLength(4);
    expect(warnings).toEqual([]);
  });

  it("asigna cada paquete a su grupo y su dificultad", () => {
    expect(offers[0]).toMatchObject({
      category: "heroic",
      groupLabel: "Venomous Abyss + Tidebound Grotto",
      titleEn: "Tidebound Grotto SAVED",
      priceGold: 100000,
    });
    expect(offers[2]).toMatchObject({
      category: "normal",
      titleEn: "Tidebound Grotto SAVED",
      priceGold: 50000,
    });
    expect(offers[3]).toMatchObject({
      category: "mythic",
      groupLabel: "VIP, ATP & FP",
      titleEn: "Venomous Abyss 2/8 FP",
      priceGold: 8650000,
    });
  });

  it("el MISMO título en dos dificultades no se pisa", () => {
    const heroico = offers[0];
    const normal = offers[2];
    expect(heroico.titleEn).toBe(normal.titleEn);
    expect(offerKey(heroico)).not.toBe(offerKey(normal));
  });

  it("saca el rombo del título, con o sin espacio detrás", () => {
    expect(offers.every((o) => !o.titleEn.includes("\u{1F538}"))).toBe(true);
    expect(offers[3].titleEn).toBe("Venomous Abyss 2/8 FP");
  });

  it("lee un título que no trae rombo", () => {
    expect(offers[1].titleEn).toBe("Venomous Abyss 6/8 UNSAVED + Last TWO SAVED");
    expect(offers[1].priceGold).toBe(1350000);
  });

  it("separa la etiqueta 'Hot' de la descripción", () => {
    expect(offers[0].badge).toBe("HOT");
    expect(offers[0].descriptionEn).toBe("1/1 - Free Roll - No Item Reserve");
    expect(offers[0].descriptionEn).not.toContain("Hot");
  });

  it("entiende los separadores de miles", () => {
    expect(offers[3].priceGold).toBe(8650000);
  });

  it("no confunde el título de un GRUPO con un paquete", () => {
    expect(offers.some((o) => o.titleEn === "VIP, ATP & FP")).toBe(false);
    expect(offers.some((o) => o.titleEn.includes("services"))).toBe(false);
  });

  it("no reutiliza la dificultad del grupo anterior", () => {
    expect(offers[3].category).toBe("mythic");
  });
});

describe("parseBoostCatalog: entradas rotas", () => {
  it("avisa del paquete sin precio en vez de inventarlo", () => {
    const { offers, warnings } = parseBoostCatalog(`
🔸 Grupo
1 services available

Heroic Raids
1 services

🔸 Sin precio
Hot
Descripción suelta
`);
    expect(offers).toHaveLength(0);
    expect(warnings[0]).toContain("Sin precio");
  });

  it("avisa del precio ilegible", () => {
    const { offers, warnings } = parseBoostCatalog(`
🔸 Grupo
1 services available

Heroic Raids
1 services

🔸 Precio raro
Hot
Algo

Price
a convenir
`);
    expect(offers).toHaveLength(0);
    expect(warnings[0]).toContain("no se entendió");
  });

  it("avisa del paquete que quedó fuera de toda dificultad", () => {
    const { offers, warnings } = parseBoostCatalog(`
🔸 Grupo
1 services available

🔸 Huérfano
Hot
Algo

Price
100 gold
`);
    expect(offers).toHaveLength(0);
    expect(warnings[0]).toContain("dificultad");
  });

  it("un texto vacío no rompe ni inventa nada", () => {
    expect(parseBoostCatalog("")).toEqual({ offers: [], warnings: [] });
    expect(parseBoostCatalog("   \n\n  ")).toEqual({ offers: [], warnings: [] });
  });

  it("acepta un paquete sin etiqueta Hot", () => {
    const { offers } = parseBoostCatalog(`
🔸 Grupo
1 services available

Normal Raids
1 services

🔸 Sin etiqueta
Solo descripción

Price
250 gold
`);
    expect(offers[0].badge).toBeNull();
    expect(offers[0].descriptionEn).toBe("Solo descripción");
  });
});

const TABLA = [
  "\tPreview\tDate\tTime (EST)",
  "▲",
  "Raid\tBuyers\tTeam\tRaid Leader\tRun Type\tDifficulty\tLoot\tNote\tActions",
  "\tMonday 09/07\t6:00 PM\tLAST TWO KILL HEROIC\t0/12\tGG\t@booster_one, @booster_three\tFull Clear\tHeroic\tFull priority\t30 MIN EACH KILL\t",
  "Discount: OFF",
  "(unlocked)",
  "\tMonday 09/07\t8:30 PM\tSAVED 5x 6/8 + 2x 8/8 Heroic Venomous Abyss\t0/7\tGG\t@booster_one\tFull Clear\tHeroic\tGroup loot\tCAN BE 5x 6/8\t",
  "Discount: OFF",
  "(unlocked)",
  "\tMonday 09/07\t11:59 PM\tSAVED 5x 6/8 + 2x 8/8Heroic Venomous Abyss This run will start at 00:30am est\t2/6\tGG\t@booster_three\tFull Clear\tHeroic\tGroup loot\tCAN BE 5x 6/8\t",
  "Discount: OFF",
  "(unlocked)",
].join("\n");

const AHORA = new Date("2026-09-07T15:00:00Z");

describe("parseBoostSchedule", () => {
  const { slots, warnings } = parseBoostSchedule(TABLA, AHORA);

  it("lee las 3 corridas y descarta encabezados y celdas sueltas", () => {
    expect(slots).toHaveLength(3);
    expect(warnings).toEqual([]);
  });

  it("convierte la hora del Este a UTC contemplando el horario de verano", () => {
    expect(slots[0].scheduledAt).toBe("2026-09-07T22:00:00.000Z");
    expect(slots[1].scheduledAt).toBe("2026-09-08T00:30:00.000Z");
    expect(slots[2].scheduledAt).toBe("2026-09-08T03:59:00.000Z");
  });

  it("separa cupos vendidos de cupo total", () => {
    expect(slots[0]).toMatchObject({ bookedCount: 0, capacity: 12 });
    expect(slots[2]).toMatchObject({ bookedCount: 2, capacity: 6 });
  });

  it("lee la dificultad y la etiqueta de la run", () => {
    expect(slots[0].difficulty).toBe("heroic");
    expect(slots[1].label).toBe("SAVED 5x 6/8 + 2x 8/8 Heroic Venomous Abyss");
  });

  it("no confunde la fila de encabezado con una corrida", () => {
    expect(slots.some((s) => s.label === "Raid")).toBe(false);
  });

  it("dos corridas del mismo día a distinta hora no comparten llave", () => {
    expect(slotKey(slots[0])).not.toBe(slotKey(slots[1]));
  });
});

const TABLA_CON_COLUMNA_NUEVA = [
  "\tPreview\tDate\tTime (EST)",
  "▲",
  "Raid\tBuyers\tTeam\tBoosters\tRaid Leader\tRun Type\tDifficulty\tLoot\tNote\tActions",
  "\tThursday 09/10\t6:00 PM\tCAN BE FTP HEROIC UP TO 20MAN\t1/1\tGG\t\t@booster_one, @booster_three\tFull Clear\tHeroic\tFull priority\tCAN BE 15 / 20 / 26 MAN FP RUN HEROIC OR NORMAL 9/9 / ANY ISSUES PLEASE DM @SUPPORTDESK\t",
  "Discount: OFF",
  "(unlocked)",
  "\tThursday 09/10\t8:00 PM\tLAST TWO KILL SPAM\t8/13\tGG\t\t@booster_one, @booster_two, @booster_three\tFull Clear\tHeroic\tGroup loot\t30 MIN EACH KILL WITH 2-3 BUYERS EACH / ANY ISSUES PLEASE DM @SUPPORTDESK\t",
  "Discount: OFF",
  "(unlocked)",
  "\tThursday 09/10\t10:00 PM\tLAST TWO KILL SPAM\t1/13\tGG\t\t@booster_one, @booster_two, @booster_three\tFull Clear\tHeroic\tGroup loot\t30 MIN EACH KILL WITH 2-3 BUYERS EACH / ANY ISSUES PLEASE DM @SUPPORTDESK\t",
  "Discount: OFF",
  "(unlocked)",
].join("\n");

describe("parseBoostSchedule: la plataforma agrega una columna", () => {
  const { slots, warnings } = parseBoostSchedule(
    TABLA_CON_COLUMNA_NUEVA,
    new Date("2026-09-10T15:00:00Z")
  );

  it("lee las 3 corridas igual que con el formato anterior", () => {
    expect(slots).toHaveLength(3);
    expect(warnings).toEqual([]);
  });

  it("encuentra la dificultad aunque se haya corrido de columna", () => {
    expect(slots.map((s) => s.difficulty)).toEqual(["heroic", "heroic", "heroic"]);
  });

  it("no toma el 'HEROIC' que va suelto adentro de la etiqueta", () => {
    expect(slots[0].label).toBe("CAN BE FTP HEROIC UP TO 20MAN");
    expect(slots[0]).toMatchObject({ bookedCount: 1, capacity: 1 });
  });

  it("dos corridas con la MISMA etiqueta a distinta hora no comparten llave", () => {
    expect(slotKey(slots[1])).not.toBe(slotKey(slots[2]));
    expect(slots[1].scheduledAt).toBe("2026-09-11T00:00:00.000Z");
    expect(slots[2].scheduledAt).toBe("2026-09-11T02:00:00.000Z");
  });
});

describe("parseBoostSchedule: casos límite", () => {
  const fila = (cols: string) => `\t${cols}\t`;

  it("omite las corridas de otro equipo y lo avisa", () => {
    const { slots, warnings } = parseBoostSchedule(
      fila("Monday 09/07\t6:00 PM\tRun ajena\t0/5\tOtherTeam\t@x\tFull Clear\tHeroic\tGroup loot\tnota"),
      AHORA
    );
    expect(slots).toHaveLength(0);
    expect(warnings[0]).toContain("OtherTeam");
  });

  it("entiende medianoche y mediodía", () => {
    const { slots } = parseBoostSchedule(
      [
        fila("Monday 09/07\t12:00 AM\tMedianoche\t0/5\tGG\t@x\tFull Clear\tHeroic\tGroup loot\tnota"),
        fila("Monday 09/07\t12:00 PM\tMediodia\t0/5\tGG\t@x\tFull Clear\tHeroic\tGroup loot\tnota"),
      ].join("\n"),
      AHORA
    );
    expect(slots[0].scheduledAt).toBe("2026-09-07T04:00:00.000Z");
    expect(slots[1].scheduledAt).toBe("2026-09-07T16:00:00.000Z");
  });

  it("elige el año que deja la fecha más cerca de hoy", () => {
    const nochevieja = new Date("2026-12-31T18:00:00Z");
    const { slots } = parseBoostSchedule(
      fila("Friday 01/02\t8:00 PM\tAño nuevo\t0/5\tGG\t@x\tFull Clear\tHeroic\tGroup loot\tnota"),
      nochevieja
    );
    expect(slots[0].scheduledAt.slice(0, 10)).toBe("2027-01-03");
  });

  it("avisa de una dificultad que no conoce", () => {
    const { slots, warnings } = parseBoostSchedule(
      fila("Monday 09/07\t6:00 PM\tRara\t0/5\tGG\t@x\tFull Clear\tLegendary\tGroup loot\tnota"),
      AHORA
    );
    expect(slots).toHaveLength(0);
    expect(warnings[0]).toContain("dificultad");
  });

  it("avisa de cupos imposibles en vez de guardarlos", () => {
    const { slots, warnings } = parseBoostSchedule(
      fila("Monday 09/07\t6:00 PM\tRota\t9/5\tGG\t@x\tFull Clear\tHeroic\tGroup loot\tnota"),
      AHORA
    );
    expect(slots).toHaveLength(0);
    expect(warnings[0]).toContain("cupos");
  });

  it("un texto sin tabuladores no produce nada", () => {
    expect(parseBoostSchedule("hola\nque tal", AHORA)).toEqual({ slots: [], warnings: [] });
  });
});

const API_RUNS = {
  info: [
    {
      id: 21260,
      date: "2026-09-10",
      difficulty: "Heroic",
      loot: "Group loot",
      maxBuyers: 13,
      name: { String: "The Venomous Abyss", Valid: true },
      note: "30 MIN EACH KILL WITH 2-3 BUYERS EACH",
      raid: "LAST TWO KILL SPAM",
      runType: "Full Clear",
      team: "GG",
      time: "22:00",
      idTeam: "100000000000000099",
      players: null,
      slotAvailable: 12,
      quantityBoss: { String: "", Valid: false },
    },
    {
      id: 21454,
      date: "2026-09-10",
      difficulty: "Heroic",
      loot: "Group loot",
      maxBuyers: 13,
      name: { String: "The Venomous Abyss", Valid: true },
      raid: "LAST TWO KILL SPAM",
      team: "GG",
      time: "20:00",
      slotAvailable: 5,
    },
    {
      id: 21246,
      date: "2026-09-10",
      difficulty: "Heroic",
      loot: "Full priority",
      maxBuyers: 1,
      name: { String: "The Venomous Abyss", Valid: true },
      raid: "CAN BE FTP HEROIC UP TO 20MAN",
      team: "GG",
      time: "18:00",
      slotAvailable: 0,
    },
  ],
  errors: [],
};

describe("parseBoostRunsJson", () => {
  const { slots, warnings } = parseBoostRunsJson(API_RUNS);

  it("lee las 3 corridas sin advertencias", () => {
    expect(slots).toHaveLength(3);
    expect(warnings).toEqual([]);
  });

  it("DERIVA los cupos vendidos: slotAvailable son los LIBRES", () => {
    expect(slots.map((s) => [s.bookedCount, s.capacity])).toEqual([
      [1, 13],
      [8, 13],
      [1, 1],
    ]);
  });

  it("guarda el id de la plataforma como llave estable", () => {
    expect(slots.map((s) => s.externalId)).toEqual([21260, 21454, 21246]);
  });

  it("toma como etiqueta el comentario, no el nombre de la raid", () => {
    expect(slots[2].label).toBe("CAN BE FTP HEROIC UP TO 20MAN");
    expect(slots.some((s) => s.label === "The Venomous Abyss")).toBe(false);
  });

  it("convierte la hora del Este con la zona, no con un -5 fijo", () => {
    expect(slots[0].scheduledAt).toBe("2026-09-11T02:00:00.000Z");
    expect(slots[1].scheduledAt).toBe("2026-09-11T00:00:00.000Z");
    expect(slots[2].scheduledAt).toBe("2026-09-10T22:00:00.000Z");
  });

  it("da el mismo resultado que pegar la tabla de ese día", () => {
    const pegado = parseBoostSchedule(TABLA_CON_COLUMNA_NUEVA, new Date("2026-09-10T15:00:00Z"));
    const orden = (a: { scheduledAt: string }, b: { scheduledAt: string }) =>
      a.scheduledAt.localeCompare(b.scheduledAt);
    const sinId = ({ externalId: _ignored, ...resto }: (typeof slots)[number]) => resto;

    expect([...slots].sort(orden).map(sinId)).toEqual([...pegado.slots].sort(orden).map(sinId));
  });
});

describe("parseBoostRunsJson: casos límite", () => {
  const run = (overrides: Record<string, unknown> = {}) => ({
    info: [
      {
        id: 1,
        date: "2026-09-10",
        time: "20:00",
        difficulty: "Heroic",
        raid: "Etiqueta",
        team: "GG",
        maxBuyers: 10,
        slotAvailable: 4,
        ...overrides,
      },
    ],
    errors: [],
  });

  it("omite las corridas de otro equipo y lo avisa", () => {
    const { slots, warnings } = parseBoostRunsJson(run({ team: "OtherTeam" }));
    expect(slots).toHaveLength(0);
    expect(warnings[0]).toContain("OtherTeam");
  });

  it("avisa si la respuesta no tiene la forma esperada", () => {
    expect(parseBoostRunsJson({}).warnings).toHaveLength(1);
    expect(parseBoostRunsJson(null).warnings).toHaveLength(1);
    expect(parseBoostRunsJson({ info: [] }).warnings).toEqual([]);
  });

  it("omite una dificultad que no conoce en vez de inventarla", () => {
    const { slots, warnings } = parseBoostRunsJson(run({ difficulty: "Mythic+" }));
    expect(slots).toHaveLength(0);
    expect(warnings[0]).toContain("Mythic+");
  });

  it("omite fechas y horas ilegibles", () => {
    expect(parseBoostRunsJson(run({ date: "10/09/2026" })).slots).toHaveLength(0);
    expect(parseBoostRunsJson(run({ time: "8:00 PM" })).slots).toHaveLength(0);
    expect(parseBoostRunsJson(run({ time: "25:00" })).slots).toHaveLength(0);
  });

  it("acepta medianoche, que no es lo mismo que una hora vacía", () => {
    const { slots } = parseBoostRunsJson(run({ time: "00:00" }));
    expect(slots).toHaveLength(1);
    expect(slots[0].scheduledAt).toBe("2026-09-10T04:00:00.000Z");
  });

  it("nunca deja los vendidos en negativo", () => {
    const { slots } = parseBoostRunsJson(run({ maxBuyers: 5, slotAvailable: 9 }));
    expect(slots[0].bookedCount).toBe(0);
  });

  it("omite cupos inválidos en vez de guardar basura", () => {
    expect(parseBoostRunsJson(run({ maxBuyers: 0 })).slots).toHaveLength(0);
    expect(parseBoostRunsJson(run({ slotAvailable: -1 })).slots).toHaveLength(0);
    expect(parseBoostRunsJson(run({ maxBuyers: "trece" })).slots).toHaveLength(0);
  });

  it("una corrida sin id se guarda igual, sin llave externa", () => {
    const { slots } = parseBoostRunsJson(run({ id: null }));
    expect(slots).toHaveLength(1);
    expect(slots[0].externalId).toBeNull();
  });
});
