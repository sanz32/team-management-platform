"use client";

import { capitalize } from "@/lib/format";
import { classColor, shortSpec } from "@/lib/wow-classes";
import { cascadeStyle } from "@/lib/cascade";
import type { ListCharacter } from "./DatosPersonajesClient";

export default function CharacterListRow({
  character,
  isSelected,
  index,
  showOwner,
  onSelect,
}: {
  character: ListCharacter;
  isSelected: boolean;
  index: number;
  showOwner: boolean;
  onSelect: () => void;
}) {
  const color = classColor(character.class);

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={isSelected ? "true" : undefined}
      style={{
        ...cascadeStyle(index),
        backgroundImage: isSelected
          ? `linear-gradient(90deg, color-mix(in srgb, ${color} 16%, transparent), transparent 70%)`
          : undefined,
      }}
      className={`cascade-item relative w-full text-left flex items-center gap-3 pl-3.5 pr-3 py-2.5 rounded-lg transition-colors ${
        isSelected ? "" : "hover:bg-[color:var(--color-surface-2)]"
      }`}
    >
      <span
        aria-hidden
        className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full transition-opacity"
        style={{ backgroundColor: color, opacity: isSelected ? 1 : 0 }}
      />
      {!isSelected && (
        <span
          aria-hidden
          className="shrink-0 w-2 h-2 rounded-full"
          style={{ backgroundColor: color }}
        />
      )}

      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-1.5 min-w-0">
          <span className="min-w-0 truncate text-sm font-semibold text-ink">
            {capitalize(character.name)}
          </span>
          <span className="shrink-0 font-data text-micro text-ink-faint">
            {character.realm_slug}
          </span>
        </span>
        <span className="block truncate text-label mt-0.5" style={{ color }}>
          {shortSpec(character.class, character.active_spec)}
          {showOwner && character.ownerName ? (
            <span className="text-ink-faint"> · {character.ownerName}</span>
          ) : null}
        </span>
      </span>

      <span className="shrink-0 font-data text-meta font-bold text-ink-muted">
        {character.ilvl ?? "—"}
      </span>
    </button>
  );
}
