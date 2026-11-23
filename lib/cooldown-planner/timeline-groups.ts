export interface TimelineCastLike {
  spellId: number;
  spellName: string;
  iconUrl: string | null;
  timestampMs: number;
  personLabel: string;
  personRoleLabel: string;
  laneColor: string;
}

export interface TimelineSpellRow<T> {
  spellId: number;
  spellName: string;
  iconUrl: string | null;
  casts: T[];
}

export interface TimelinePersonGroup<T> {
  personLabel: string;
  displayLabel: string;
  color: string;
  castCount: number;
  rows: TimelineSpellRow<T>[];
}

export function groupCastsByPerson<T extends TimelineCastLike>(casts: T[]): TimelinePersonGroup<T>[] {
  const byPerson = new Map<string, T[]>();
  for (const cast of casts) {
    const bucket = byPerson.get(cast.personLabel);
    if (bucket) bucket.push(cast);
    else byPerson.set(cast.personLabel, [cast]);
  }

  const people = Array.from(byPerson.entries())
    .map(([personLabel, personCasts]) => ({ personLabel, personCasts }))
    .sort((a, b) => {
      const byRole = a.personCasts[0].personRoleLabel.localeCompare(b.personCasts[0].personRoleLabel);
      return byRole !== 0 ? byRole : a.personLabel.localeCompare(b.personLabel);
    });

  const roleTotals = new Map<string, number>();
  for (const person of people) {
    const role = person.personCasts[0].personRoleLabel;
    roleTotals.set(role, (roleTotals.get(role) ?? 0) + 1);
  }
  const roleSeen = new Map<string, number>();

  return people.map(({ personLabel, personCasts }) => {
    const role = personCasts[0].personRoleLabel;
    const seen = (roleSeen.get(role) ?? 0) + 1;
    roleSeen.set(role, seen);

    const bySpell = new Map<number, T[]>();
    for (const cast of personCasts) {
      const bucket = bySpell.get(cast.spellId);
      if (bucket) bucket.push(cast);
      else bySpell.set(cast.spellId, [cast]);
    }

    const rows = Array.from(bySpell.values())
      .map((spellCasts) => {
        const ordered = [...spellCasts].sort((a, b) => a.timestampMs - b.timestampMs);
        return {
          spellId: ordered[0].spellId,
          spellName: ordered[0].spellName,
          iconUrl: ordered[0].iconUrl,
          casts: ordered,
        };
      })
      .sort((a, b) => a.casts[0].timestampMs - b.casts[0].timestampMs);

    return {
      personLabel,
      displayLabel: (roleTotals.get(role) ?? 0) > 1 ? `${role} ${seen}` : role,
      color: personCasts[0].laneColor,
      castCount: personCasts.length,
      rows,
    };
  });
}

export interface TimelineBossRow<T> {
  spellName: string;
  iconUrl: string | null;
  color: string;
  events: T[];
}

export function groupBossEvents<T extends { spellName: string; timestampMs: number; iconUrl: string | null }>(
  events: T[],
  palette: string[]
): TimelineBossRow<T>[] {
  const byName = new Map<string, T[]>();
  for (const event of events) {
    const bucket = byName.get(event.spellName);
    if (bucket) bucket.push(event);
    else byName.set(event.spellName, [event]);
  }

  return Array.from(byName.entries())
    .map(([spellName, spellEvents]) => {
      const ordered = [...spellEvents].sort((a, b) => a.timestampMs - b.timestampMs);
      return { spellName, iconUrl: ordered[0].iconUrl, events: ordered };
    })
    .sort((a, b) => a.events[0].timestampMs - b.events[0].timestampMs)
    .map((row, index) => ({ ...row, color: palette[index % palette.length] }));
}

export interface TimelinePhaseBand {
  label: string;
  startMs: number;
  endMs: number;
  isIntermission: boolean;
}

export interface PhaseTransitionLike {
  ms: number;
  isIntermission: boolean;
}

export function phaseBandsFromTransitions(
  transitions: PhaseTransitionLike[],
  durationMs: number
): TimelinePhaseBand[] {
  if (transitions.length === 0) return [];
  const sorted = [...transitions].sort((a, b) => a.ms - b.ms);
  let phaseCount = 0;
  let intermissionCount = 0;
  return sorted.map((t, i) => ({
    label: t.isIntermission ? `Intermisión ${++intermissionCount}` : `Fase ${++phaseCount}`,
    startMs: t.ms,
    endMs: sorted[i + 1]?.ms ?? durationMs,
    isIntermission: t.isIntermission,
  }));
}
