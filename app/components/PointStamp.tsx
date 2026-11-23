export const POINT_COLOR = "var(--color-warning)";

export function pointsLabel(points: number): string {
  return points === 1 ? "punto" : "puntos";
}

export function formatDiscount(percentValue: number): string {
  const rounded = Math.round(percentValue * 100) / 100;
  return `−${rounded % 1 === 0 ? rounded : rounded.toFixed(2)}%`;
}

const SIZES = {
  xl: { box: "w-20 h-20", value: "text-4xl", caption: "text-label" },
  lg: { box: "w-16 h-16", value: "text-3xl", caption: "text-micro" },
  md: { box: "w-12 h-12", value: "text-xl", caption: "text-micro" },
  sm: { box: "w-9 h-9", value: "text-sm", caption: "" },
  xs: { box: "w-7 h-7", value: "text-xs", caption: "" },
} as const;

export default function PointStamp({
  points,
  size = "md",
}: {
  points: number;
  size?: keyof typeof SIZES;
}) {
  const s = SIZES[size];
  return (
    <span
      className={`${s.box} rounded-lg flex flex-col items-center justify-center shrink-0 leading-none`}
      style={{
        backgroundColor: `color-mix(in srgb, ${POINT_COLOR} 12%, transparent)`,
        border: `1px solid color-mix(in srgb, ${POINT_COLOR} 35%, transparent)`,
      }}
      aria-label={`${points} ${pointsLabel(points)}`}
    >
      <span
        className={`font-heading font-bold tabular-nums ${s.value}`}
        style={{ color: POINT_COLOR }}
      >
        {points}
      </span>
      {s.caption && (
        <span className={`${s.caption} uppercase tracking-widest text-ink-faint mt-0.5`}>
          {points === 1 ? "pt" : "pts"}
        </span>
      )}
    </span>
  );
}
