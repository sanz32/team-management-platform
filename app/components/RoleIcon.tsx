import { Swords } from "lucide-react";

const ROLE_META: Record<
  string,
  { color: string; label: string; path?: string; icon?: typeof Swords }
> = {
  tank: {
    color: "var(--color-tank)",
    label: "Tank",
    path: "M12 2l7 3.2v5.6c0 5.1-3.1 9-7 10.7-3.9-1.7-7-5.6-7-10.7V5.2L12 2z",
  },
  heal: {
    color: "var(--color-heal)",
    label: "Heal",
    path: "M10.5 2h3v8.5H22v3h-8.5V22h-3v-8.5H2v-3h8.5V2z",
  },
  dps: {
    color: "var(--color-dps)",
    label: "DPS",
    icon: Swords,
  },
};

export default function RoleIcon({
  role,
  size = 22,
  showLabel = false,
  className,
}: {
  role: string | null | undefined;
  size?: number;
  showLabel?: boolean;
  className?: string;
}) {
  const meta = role ? ROLE_META[role] : null;

  if (!meta) {
    return <span className="text-ink-faint text-xs">-</span>;
  }

  return (
    <span className={`inline-flex items-center gap-1.5 ${className ?? ""}`} title={meta.label}>
      <span
        className="inline-flex items-center justify-center rounded-full shrink-0"
        style={{
          width: size,
          height: size,
          color: meta.color,
          backgroundColor: `color-mix(in srgb, ${meta.color} 18%, transparent)`,
          border: `1px solid color-mix(in srgb, ${meta.color} 45%, transparent)`,
        }}
      >
        {meta.icon ? (
          <meta.icon size={size * 0.55} strokeWidth={2.25} />
        ) : (
          <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: size * 0.55, height: size * 0.55 }}>
            <path d={meta.path} />
          </svg>
        )}
      </span>
      {showLabel && (
        <span className="text-xs font-medium capitalize" style={{ color: meta.color }}>
          {meta.label}
        </span>
      )}
    </span>
  );
}
