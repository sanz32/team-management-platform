import { describe, expect, it, vi } from "vitest";
import { Candidate, RosterSelection } from "@/lib/roster-generator";

vi.mock("@/lib/discord-emojis", () => ({
  classEmoji: (className: string | null | undefined) =>
    className ? `<:${className.toLowerCase().replace(/ /g, "")}:1>` : "",
}));

const { buildRosterAnnouncementContent } = await import("@/lib/discord-notify");

function entry(
  role: string,
  name: string,
  className: string | null,
  overrides: Partial<Candidate> = {}
): RosterSelection {
  return {
    role,
    isSaved: null,
    candidate: {
      id: `char-${name}`,
      user_id: `user-${name}`,
      name,
      realm_slug: "ragnaros",
      region: "us",
      ilvl: 285,
      class: className,
      active_spec: null,
      role,
      discord_username: name,
      isOffSpec: false,
      specUsed: null,
      hasMochila: false,
      mochilaCount: 0,
      isMainClass: true,
      ownerMainClasses: className ? [className] : [],
      tier: "normal" as const,
      isDayOff: false,
      ...overrides,
    },
  };
}

const SCHEDULED = "2026-08-04T20:00:00.000Z";

describe("buildRosterAnnouncementContent", () => {
  it("pone icono de rol, icono de clase, nombre y ilvl en ese orden", () => {
    const content = buildRosterAnnouncementContent(
      { scheduledFor: SCHEDULED, selected: [entry("tank", "nërÿ", "Warrior")], averageIlvl: 285 },
      undefined,
      []
    );

    expect(content).toContain("🛡️ <:warrior:1> **Nërÿ-ragnaros — ilvl 285**");
  });

  it("agrupa por rol en el orden tank, heal, dps", () => {
    const content = buildRosterAnnouncementContent(
      {
        scheduledFor: SCHEDULED,
        selected: [
          entry("dps", "damager", "Mage"),
          entry("tank", "tanque", "Paladin"),
          entry("heal", "sanador", "Monk"),
        ],
        averageIlvl: 285,
      },
      undefined,
      []
    );

    expect(content.indexOf("Tanque")).toBeLessThan(content.indexOf("Sanador"));
    expect(content.indexOf("Sanador")).toBeLessThan(content.indexOf("Damager"));
  });

  it("lista a quienes llevan mochila, con el nick y no el personaje", () => {
    const content = buildRosterAnnouncementContent(
      {
        scheduledFor: SCHEDULED,
        selected: [entry("dps", "damager", "Mage")],
        averageIlvl: 285,
        mochilaAssignees: [
          { userId: "u1", discordUsername: "arden", characterId: "c1", characterName: "Damager" },
          { userId: "u2", discordUsername: "nery", characterId: "c2", characterName: "Otro" },
        ],
      },
      undefined,
      []
    );

    expect(content).toContain("🎒 **Mochila: arden, nery**");
  });

  it("sin mochila no aparece la linea de mochila", () => {
    const content = buildRosterAnnouncementContent(
      { scheduledFor: SCHEDULED, selected: [entry("dps", "damager", "Mage")], averageIlvl: 285 },
      undefined,
      []
    );

    expect(content).not.toContain("Mochila");
  });

  it("una clase sin emoji configurado sale sin icono, sin espacios de mas", () => {
    const content = buildRosterAnnouncementContent(
      { scheduledFor: SCHEDULED, selected: [entry("tank", "tanque", null)], averageIlvl: 285 },
      undefined,
      []
    );

    expect(content).toContain("🛡️ **Tanque-ragnaros");
  });

  it("avisa la Off-Spec y el estado saved/unsaved cuando corresponde", () => {
    const saved = { ...entry("heal", "sanador", "Monk", { isOffSpec: true, specUsed: "Mistweaver" }) };
    saved.isSaved = true;

    const content = buildRosterAnnouncementContent(
      { scheduledFor: SCHEDULED, selected: [saved], averageIlvl: 285 },
      undefined,
      []
    );

    expect(content).toContain("(Off-Spec: Mistweaver)");
    expect(content).toContain("🔴");
  });

  it("un roster largo se trunca en un salto de linea, nunca partiendo un emoji", () => {
    const selected = Array.from({ length: 60 }, (_, i) =>
      entry("dps", `personaje${i}`, "Death Knight")
    );

    const content = buildRosterAnnouncementContent(
      { scheduledFor: SCHEDULED, selected, averageIlvl: 285 },
      "999",
      []
    );

    expect(content.length).toBeLessThanOrEqual(2000);
    expect(content).toContain("mensaje truncado");
    const opened = (content.match(/<:/g) ?? []).length;
    const closed = (content.match(/:1>/g) ?? []).length;
    expect(opened).toBe(closed);
  });
});
