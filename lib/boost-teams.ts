export const TEAM_SLUG_PREFIX = "team";

const SLUG_MAX = 24;

export function cleanDisplayName(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N} ._-]/gu, "")
    .replace(/\s+/g, " ")
    .replace(/^[._\-\s]+|[._\-\s]+$/g, "");
}

export function suggestTeamName(source: {
  globalName?: string | null;
  nickname?: string | null;
  username?: string | null;
}): string {
  for (const candidate of [source.globalName, source.nickname, source.username]) {
    const limpio = cleanDisplayName(candidate);
    if (limpio.length >= 2) return limpio;
  }
  return "";
}

export function teamBrand(teamName: string | null | undefined, fallback = "Team Nova"): string {
  const limpio = cleanDisplayName(teamName);
  if (limpio.length < 2) return fallback;
  return /^team\b/i.test(limpio) ? limpio : `Team ${limpio}`;
}

function slugBase(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .normalize("NFKC")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function teamSlugCandidates(
  teamName: string | null | undefined,
  fallbacks: (string | null | undefined)[] = [],
  randomSuffixes: string[] = []
): string[] {
  const sinPrefijo = cleanDisplayName(teamName).replace(/^team\s*/i, "");

  let base = "";
  for (const candidate of [sinPrefijo, ...fallbacks]) {
    base = slugBase(candidate);
    if (base.length >= 2) break;
  }
  if (base.length < 2) base = "nova";

  const tope = SLUG_MAX - TEAM_SLUG_PREFIX.length;
  base = base.slice(0, tope);

  const candidates = [`${TEAM_SLUG_PREFIX}${base}`];
  for (const suffix of randomSuffixes) {
    const limpio = suffix.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!limpio) continue;
    candidates.push(`${TEAM_SLUG_PREFIX}${base.slice(0, tope - limpio.length)}${limpio}`);
  }
  return candidates;
}

export function isTeamSlug(segment: string | null | undefined): boolean {
  if (!segment) return false;
  return new RegExp(`^${TEAM_SLUG_PREFIX}[a-z0-9]{2,}$`).test(segment);
}
