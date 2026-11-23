import { describe, expect, it } from "vitest";
import { classEmoji } from "@/lib/discord-emojis";
import { ALL_CLASSES } from "@/lib/wow-classes";

describe("classEmoji", () => {
  it("las 13 clases de WoW tienen su emoji configurado", () => {
    const sinEmoji = ALL_CLASSES.filter((c) => !classEmoji(c));
    expect(sinEmoji).toEqual([]);
  });

  it("cada emoji tiene la forma <:nombre:id> que exige la API de Discord", () => {
    for (const className of ALL_CLASSES) {
      expect(classEmoji(className)).toMatch(/^<:[a-z0-9_]+:\d+>$/);
    }
  });

  it("una clase desconocida o nula devuelve string vacio, no basura", () => {
    expect(classEmoji(null)).toBe("");
    expect(classEmoji(undefined)).toBe("");
    expect(classEmoji("Tinkerer")).toBe("");
  });
});
