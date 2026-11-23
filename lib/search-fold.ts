export function foldForSearch(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function matchesSearch(query: string, ...fields: (string | null | undefined)[]): boolean {
  const q = foldForSearch(query.trim());
  if (!q) return false;
  return fields.some((f) => (f ? foldForSearch(f).includes(q) : false));
}
