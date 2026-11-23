import type { Difficulty } from "@/lib/raids";
import { raidHeaderImagePosition, TRACKED_LOCKOUT_DIFFICULTIES } from "@/lib/raids";

export interface RaidUnsavedRowRaid {
  key: string;
  name: string;
  abbr: string;
  color: string;
  headerImageUrl: string | null;
  difficulties: Difficulty[];
  counts: Partial<Record<Difficulty, number>>;
}

const BADGE_LABEL: Partial<Record<Difficulty, string>> = {
  normal: "N",
  heroic: "HC",
  mythic: "M",
};

type RowSize = "md" | "lg";

const SIZE_CONFIG: Record<
  RowSize,
  {
    row: string;
    abbrPill: string;
    abbrText: string;
    badgeGap: string;
    badgePad: string;
    badgeLabel: string;
    badgeNumber: string;
  }
> = {
  md: {
    row: "h-11 px-2 rounded-md",
    abbrPill: "h-6 px-2",
    abbrText: "text-xs",
    badgeGap: "gap-1.5",
    badgePad: "px-1.5 py-1",
    badgeLabel: "text-micro",
    badgeNumber: "text-sm",
  },
  lg: {
    row: "h-24 px-3 rounded-lg",
    abbrPill: "h-7 px-2.5",
    abbrText: "text-sm",
    badgeGap: "gap-2",
    badgePad: "px-2.5 py-1.5",
    badgeLabel: "text-micro",
    badgeNumber: "text-2xl",
  },
};

function DifficultyCountBadge({
  label,
  count,
  color,
  size,
}: {
  label: string;
  count: number;
  color: string;
  size: RowSize;
}) {
  const cfg = SIZE_CONFIG[size];
  const hasUnsaved = count > 0;
  const tone = hasUnsaved ? color : "var(--color-ink-faint)";
  return (
    <span
      className={`flex flex-col items-center justify-center leading-none rounded-md gap-0.5 ${cfg.badgePad}`}
      style={{ backgroundColor: "rgba(9,10,13,0.85)" }}
    >
      <span className={`${cfg.badgeLabel} font-bold tracking-wide`} style={{ color: tone }}>
        {label}
      </span>
      <span className={`font-data ${cfg.badgeNumber} font-bold`} style={{ color: tone }}>
        {count}
      </span>
    </span>
  );
}

export default function RaidUnsavedRow({ raid, size = "md" }: { raid: RaidUnsavedRowRaid; size?: RowSize }) {
  const cfg = SIZE_CONFIG[size];
  const trackedDifficulties = TRACKED_LOCKOUT_DIFFICULTIES.filter((d) => raid.difficulties.includes(d));
  const total = trackedDifficulties.reduce((sum, d) => sum + (raid.counts[d] ?? 0), 0);
  const hasUnsaved = total > 0;
  const titleParts = trackedDifficulties.map((d) => `${BADGE_LABEL[d]}: ${raid.counts[d] ?? 0}`).join(", ");
  return (
    <div
      className={`relative flex items-center justify-between overflow-hidden shrink-0 ${cfg.row}`}
      style={{
        boxShadow: `inset 0 0 0 1px ${hasUnsaved ? raid.color : "var(--color-line)"}`,
        backgroundImage: raid.headerImageUrl
          ? `radial-gradient(ellipse at center, transparent 45%, rgba(10,10,14,0.5) 100%), url(${raid.headerImageUrl})`
          : `linear-gradient(160deg, color-mix(in srgb, ${raid.color} 45%, var(--color-surface-2)), var(--color-surface-2))`,
        backgroundSize: "cover",
        backgroundPosition: raidHeaderImagePosition(raid.key),
      }}
      title={`${raid.name} -- ${titleParts} personaje${total === 1 ? "" : "s"} disponible${total === 1 ? "" : "s"} esta semana`}
    >
      <span
        className={`flex items-center rounded-full font-heading font-bold leading-none shrink-0 ${cfg.abbrPill} ${cfg.abbrText}`}
        style={{ backgroundColor: "rgba(9,10,13,0.85)", color: raid.color }}
      >
        {raid.abbr}
      </span>
      <div className={`flex items-center shrink-0 ${cfg.badgeGap}`}>
        {trackedDifficulties.map((d) => (
          <DifficultyCountBadge key={d} label={BADGE_LABEL[d]!} count={raid.counts[d] ?? 0} color={raid.color} size={size} />
        ))}
      </div>
    </div>
  );
}
