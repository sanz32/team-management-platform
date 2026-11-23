export interface BoosterShare {
  userId: string | null;
  freelanceName: string | null;
  cutPercent: number;
}

export interface CutRow {
  user_id: string | null;
  freelance_name: string | null;
  cut_amount: number;
  cut_percent: number;
}

function clampPercent(p: number): number {
  if (!Number.isFinite(p)) return 100;
  return Math.min(100, Math.max(0, p));
}

function floorToCents(amount: number): number {
  return Math.floor(amount * 100 + 1e-9) / 100;
}

export function computeCutRows(
  pot: number,
  advUserId: string | null,
  boosters: BoosterShare[],
  advCutPercent: number = 20
): CutRow[] {
  const advCommission = advUserId ? pot * (advCutPercent / 100) : 0;
  const remaining = pot - advCommission;

  const seenUserIds = new Set<string>();
  const uniqueBoosters: BoosterShare[] = [];
  for (const b of boosters) {
    if (b.userId) {
      if (seenUserIds.has(b.userId)) continue;
      seenUserIds.add(b.userId);
    }
    uniqueBoosters.push(b);
  }

  const n = uniqueBoosters.length;
  const baseCut = n > 0 ? remaining / n : 0;

  const percents = uniqueBoosters.map((b) => clampPercent(b.cutPercent));
  const retained = percents.map((p) => baseCut * (p / 100));
  const totalShortfall = retained.reduce((sum, amount) => sum + (baseCut - amount), 0);

  const fullShareIndexes = percents
    .map((p, i) => i)
    .filter((i) => percents[i] >= 100);
  const recipientIndexes = fullShareIndexes.length > 0 ? fullShareIndexes : uniqueBoosters.map((_, i) => i);
  const bonusPerRecipient = recipientIndexes.length > 0 ? totalShortfall / recipientIndexes.length : 0;

  const amounts = retained.slice();
  for (const i of recipientIndexes) {
    amounts[i] += bonusPerRecipient;
  }

  const rows: CutRow[] = uniqueBoosters.map((b, i) => {
    let amount = amounts[i];
    if (advUserId && b.userId === advUserId) {
      amount += advCommission;
    }
    return {
      user_id: b.userId,
      freelance_name: b.freelanceName,
      cut_amount: floorToCents(amount),
      cut_percent: percents[i],
    };
  });

  if (advUserId && !uniqueBoosters.some((b) => b.userId === advUserId)) {
    rows.push({
      user_id: advUserId,
      freelance_name: null,
      cut_amount: floorToCents(advCommission),
      cut_percent: 100,
    });
  }

  return rows;
}
