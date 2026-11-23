export const ROSTER_TIERS = ["preferido", "normal", "ultimo_recurso", "excluido"] as const;

export type CharacterTier = (typeof ROSTER_TIERS)[number];

export const ROSTER_TIER_LABELS: Record<CharacterTier, string> = {
  preferido: "Preferido",
  normal: "Normal",
  ultimo_recurso: "Último recurso",
  excluido: "Excluido",
};

export const ROSTER_TIER_HINTS: Record<CharacterTier, string> = {
  preferido: "Se elige antes que otros aunque tengan más ilvl.",
  normal: "Sin preferencia: el algoritmo decide.",
  ultimo_recurso: "Solo entra si la alternativa es dejar un cupo vacío.",
  excluido: "No aparece en ningún roster, ni para armarlo a mano.",
};
