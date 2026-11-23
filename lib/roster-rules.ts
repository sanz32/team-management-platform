interface ContentLike {
  raidKeys: string[];
  difficulty: string;
}

interface SelectionLike {
  role: string;
  candidate: { class: string | null };
}

export function requiresVoidspireMythicMonkHeal(content: ContentLike | null | undefined): boolean {
  return !!content && content.difficulty === "mythic" && content.raidKeys.includes("voidspire");
}

export function hasMonkHeal(selected: SelectionLike[]): boolean {
  return selected.some((s) => s.role === "heal" && s.candidate.class === "Monk");
}

export const VOIDSPIRE_MYTHIC_MONK_HEAL_ERROR =
  "Voidspire Mítico necesita al menos 1 Monje Heal en el roster -- sin excepciones.";
