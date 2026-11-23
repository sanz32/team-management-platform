export interface NsrtAssignmentInput {
  spellId: number;
  spellName: string;
  timestampMs: number;
  characterName: string;
  phase: number;
}

export interface NsrtBossNoteInput {
  bossName: string;
  encounterId: number | null;
  difficulty: string | null;
  pullDurationMs: number | null;
  assignments: NsrtAssignmentInput[];
}

function toSeconds(ms: number): number {
  return Math.round(ms / 1000);
}

function formatClock(ms: number): string {
  const total = toSeconds(ms);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function reminderLine(assignment: NsrtAssignmentInput): string {
  return `time:${toSeconds(assignment.timestampMs)};ph:${assignment.phase};tag:${assignment.characterName};spellid:${assignment.spellId};`;
}

function headerLine(input: NsrtBossNoteInput): string {
  const parts: string[] = [];
  if (input.encounterId !== null) parts.push(`EncounterID:${input.encounterId}`);
  if (input.difficulty) parts.push(`Difficulty:${input.difficulty}`);
  parts.push(`Name:${input.bossName}`);
  return parts.join(";") + ";";
}

export function generateNsrtBossNote(input: NsrtBossNoteInput): string {
  if (input.assignments.length === 0) return "";

  const ordered = [...input.assignments].sort((a, b) => a.timestampMs - b.timestampMs);
  const title = input.pullDurationMs
    ? `${input.bossName} (pull ${formatClock(input.pullDurationMs)})`
    : input.bossName;

  return [
    headerLine(input),
    ...ordered.map(reminderLine),
    "",
    title,
    ...ordered.map((a) => `${formatClock(a.timestampMs)} ${a.spellName} - ${a.characterName}`),
  ].join("\n");
}

export function generateNsrtFullNightNote(bosses: NsrtBossNoteInput[]): string {
  return bosses
    .map(generateNsrtBossNote)
    .filter((note) => note !== "")
    .join("\n\n");
}
