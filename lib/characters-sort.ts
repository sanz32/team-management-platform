import { classOrderIndex } from "./wow-classes";

interface SortableCharacter {
  id: string;
  class: string | null;
  ilvl: number | null;
  sort_order: number | null;
}

function sortByClassThenIlvl<T extends SortableCharacter>(characters: T[]): T[] {
  return [...characters].sort((a, b) => {
    const diff = classOrderIndex(a.class) - classOrderIndex(b.class);
    if (diff !== 0) return diff;
    return (b.ilvl ?? -1) - (a.ilvl ?? -1);
  });
}

export function sortCharacters<T extends SortableCharacter>(characters: T[]): T[] {
  const hasCustomOrder = characters.some((c) => c.sort_order !== null && c.sort_order !== undefined);
  if (!hasCustomOrder) return sortByClassThenIlvl(characters);

  return [...characters].sort((a, b) => {
    const aOrder = a.sort_order ?? Number.MAX_SAFE_INTEGER;
    const bOrder = b.sort_order ?? Number.MAX_SAFE_INTEGER;
    return aOrder - bOrder;
  });
}
