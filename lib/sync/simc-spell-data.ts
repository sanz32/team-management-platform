export interface SimcSpellRecord {
  spellId: number;
  name: string;
  classes: string[];
  durationSeconds: number | null;
  cooldownSeconds: number | null;
}

const NAME_LINE = /^Name\s*:\s*(.+?)\s*\(id=(\d+)\)/;
const CLASS_LINE = /^Class\s*:\s*(.+)$/;
const DURATION_LINE = /^Duration\s*:\s*(.+)$/;
const COOLDOWN_LINE = /^Cooldown\s*:\s*(.+)$/;

function parseSecondsValue(raw: string): number | null {
  const match = raw.trim().match(/^([\d.]+)\s*seconds?$/i);
  return match ? parseFloat(match[1]) : null;
}

export function parseSimcSpellDataDump(text: string): SimcSpellRecord[] {
  const blocks = text.split(/\r?\n\r?\n/);
  const records: SimcSpellRecord[] = [];

  for (const block of blocks) {
    let spellId: number | null = null;
    let name: string | null = null;
    let classes: string[] = [];
    let durationSeconds: number | null = null;
    let cooldownSeconds: number | null = null;

    for (const line of block.split(/\r?\n/)) {
      const nameMatch = line.match(NAME_LINE);
      if (nameMatch) {
        name = nameMatch[1].trim();
        spellId = parseInt(nameMatch[2], 10);
        continue;
      }
      const classMatch = line.match(CLASS_LINE);
      if (classMatch) {
        classes = classMatch[1]
          .split(",")
          .map((c) => c.trim())
          .filter(Boolean);
        continue;
      }
      const durationMatch = line.match(DURATION_LINE);
      if (durationMatch) {
        durationSeconds = parseSecondsValue(durationMatch[1]);
        continue;
      }
      const cooldownMatch = line.match(COOLDOWN_LINE);
      if (cooldownMatch) {
        cooldownSeconds = parseSecondsValue(cooldownMatch[1]);
      }
    }

    if (spellId !== null && name !== null) {
      records.push({ spellId, name, classes, durationSeconds, cooldownSeconds });
    }
  }

  return records;
}
