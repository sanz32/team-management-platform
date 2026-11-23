import { capitalize } from "@/lib/format";

export interface TooltipCharacter {
  name: string;
  realm_slug: string;
  realm_name: string | null;
  class: string | null;
  active_spec: string | null;
  ilvl: number | null;
  level: number | null;
}

export function characterTooltip(character: TooltipCharacter): string {
  const realm = character.realm_name ?? character.realm_slug;
  const spec = character.active_spec ? ` ${character.active_spec}` : "";
  return `Nivel ${character.level ?? "—"} · ${capitalize(character.name)}-${realm} · ${
    character.class ?? "Sin clase"
  }${spec} · ilvl ${character.ilvl ?? "—"}`;
}
