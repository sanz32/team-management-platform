export interface TemplateSlot {
  id: string;
  difficulty: string;
  label: string | null;
  scheduledAt: string;
  offerIds: string[];
}

export interface TemplateSuggestion {
  offerIds: string[];
  sourceSlotId: string;
  sourceScheduledAt: string;
}

export function templateKey(difficulty: string, label: string | null): string | null {
  const limpio = (label ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  if (!limpio) return null;
  return `${difficulty}::${limpio}`;
}

export function buildSlotTemplates(slots: TemplateSlot[]): Map<string, TemplateSuggestion> {
  const porLlave = new Map<string, TemplateSuggestion>();

  for (const slot of slots) {
    if (slot.offerIds.length === 0) continue;
    const key = templateKey(slot.difficulty, slot.label);
    if (!key) continue;

    const actual = porLlave.get(key);
    if (!actual || slot.scheduledAt > actual.sourceScheduledAt) {
      porLlave.set(key, {
        offerIds: [...slot.offerIds],
        sourceSlotId: slot.id,
        sourceScheduledAt: slot.scheduledAt,
      });
    }
  }

  return porLlave;
}

export function suggestTemplates(
  slots: TemplateSlot[],
  now: Date = new Date()
): Map<string, TemplateSuggestion> {
  const plantillas = buildSlotTemplates(slots);
  const sugerencias = new Map<string, TemplateSuggestion>();
  const ahora = now.getTime();

  for (const slot of slots) {
    if (slot.offerIds.length > 0) continue;
    const cuando = new Date(slot.scheduledAt).getTime();
    if (!Number.isFinite(cuando) || cuando <= ahora) continue;

    const key = templateKey(slot.difficulty, slot.label);
    if (!key) continue;

    const plantilla = plantillas.get(key);
    if (!plantilla || plantilla.sourceSlotId === slot.id) continue;

    sugerencias.set(slot.id, plantilla);
  }

  return sugerencias;
}
