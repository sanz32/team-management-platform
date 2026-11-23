"use client";

import { useMemo } from "react";
import { Search } from "lucide-react";
import { classColor } from "@/lib/wow-classes";
import { memberAccent } from "../characters/MemberAvatar";
import CharacterListRow from "./CharacterListRow";
import type { ListCharacter, SortKey } from "./DatosPersonajesClient";

export const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "default", label: "Tu orden" },
  { key: "ilvl", label: "ilvl" },
  { key: "rating", label: "Rating M+" },
  { key: "name", label: "Nombre" },
];

export default function CharacterListPanel({
  characters,
  visible,
  selectedId,
  onSelect,
  search,
  onSearchChange,
  filterKey,
  onFilterKeyChange,
  sortKey,
  onSortKeyChange,
  showOwner,
  loading,
}: {
  characters: ListCharacter[];
  visible: ListCharacter[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  search: string;
  onSearchChange: (value: string) => void;
  filterKey: string;
  onFilterKeyChange: (value: string) => void;
  sortKey: SortKey;
  onSortKeyChange: (value: SortKey) => void;
  showOwner: boolean;
  loading: boolean;
}) {
  const chips = useMemo(() => {
    if (showOwner) {
      const counts = new Map<string, { label: string; count: number }>();
      for (const c of characters) {
        const key = c.user_id ?? c.ownerName ?? "unknown";
        const entry = counts.get(key);
        if (entry) entry.count += 1;
        else counts.set(key, { label: c.ownerName ?? "Desconocido", count: 1 });
      }
      const ownerChips = Array.from(counts.entries())
        .sort((a, b) => b[1].count - a[1].count || a[1].label.localeCompare(b[1].label, "es"))
        .map(([key, { label, count }]) => ({ key, label, count }));
      return [{ key: "all", label: "Todos", count: characters.length }, ...ownerChips];
    }

    const counts = new Map<string, number>();
    for (const c of characters) {
      if (c.class) counts.set(c.class, (counts.get(c.class) ?? 0) + 1);
    }
    const classChips = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([key, count]) => ({ key, label: key, count }));
    return [{ key: "all", label: "Todos", count: characters.length }, ...classChips];
  }, [characters, showOwner]);

  return (
    <div className="card p-4 lg:sticky lg:top-4">
      <div className="relative mb-3">
        <Search
          className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none"
          aria-hidden
        />
        <input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Buscar personaje..."
          aria-label="Buscar personaje"
          className="input w-full pl-9 pr-3 py-2 text-sm"
        />
      </div>

      <div className="flex flex-wrap gap-1.5 mb-3">
        {chips.map((chip) => {
          const isActive = filterKey === chip.key;
          const color =
            chip.key === "all" ? "var(--color-primary)" : showOwner ? memberAccent(chip.key) : classColor(chip.key);
          return (
            <button
              key={chip.key}
              type="button"
              onClick={() => onFilterKeyChange(chip.key)}
              className="font-data text-micro px-2.5 py-1 rounded-full transition-colors"
              style={
                isActive
                  ? {
                      backgroundColor: `color-mix(in srgb, ${color} 18%, transparent)`,
                      border: `1px solid color-mix(in srgb, ${color} 45%, transparent)`,
                      color,
                    }
                  : {
                      backgroundColor: "var(--color-surface-2)",
                      border: "1px solid var(--color-line)",
                      color: "var(--color-ink-muted)",
                    }
              }
            >
              {chip.label} {chip.count}
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-2 mb-3 pb-3 border-b border-line">
        <label
          htmlFor="datos-personajes-orden"
          className="font-data text-micro uppercase tracking-[0.12em] text-ink-faint"
        >
          Ordenar por
        </label>
        <select
          id="datos-personajes-orden"
          value={sortKey}
          onChange={(e) => onSortKeyChange(e.target.value as SortKey)}
          className="input px-2 py-1 text-xs"
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.key} value={option.key}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-0.5 max-h-[calc(100vh-19rem)] overflow-y-auto pr-1">
        {loading && <p className="text-ink-faint text-xs text-center py-8">Cargando personajes...</p>}
        {!loading &&
          visible.map((character, index) => (
            <CharacterListRow
              key={character.id}
              character={character}
              index={index}
              isSelected={character.id === selectedId}
              showOwner={showOwner}
              onSelect={() => onSelect(character.id)}
            />
          ))}
        {!loading && visible.length === 0 && (
          <p className="text-ink-faint text-xs text-center py-8">
            {characters.length === 0
              ? "Todavía no hay personajes que mostrar."
              : "Ningún personaje coincide con la búsqueda."}
          </p>
        )}
      </div>
    </div>
  );
}
