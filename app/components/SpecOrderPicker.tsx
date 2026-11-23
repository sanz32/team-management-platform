import { classSpecs, specRole } from "@/lib/wow-classes";
import RoleIcon from "./RoleIcon";

export default function SpecOrderPicker({
  wowClass,
  order,
  onToggle,
  compact = false,
}: {
  wowClass: string;
  order: string[];
  onToggle: (spec: string) => void;
  compact?: boolean;
}) {
  const specs = classSpecs(wowClass);

  if (compact) {
    return (
      <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${specs.length}, minmax(0, 1fr))` }}>
        {specs.map((spec) => {
          const position = order.indexOf(spec);
          const selected = position !== -1;
          const isMain = position === 0;
          const badgeColor = isMain ? "var(--color-gold)" : "var(--color-secondary)";
          return (
            <button
              key={spec}
              type="button"
              onClick={() => onToggle(spec)}
              className="relative flex flex-col items-center justify-center gap-1 rounded-lg px-1 py-2 text-center transition-colors"
              style={{
                backgroundColor: selected
                  ? `color-mix(in srgb, ${badgeColor} 14%, transparent)`
                  : "var(--color-surface-2)",
                border: `1px solid ${
                  selected ? `color-mix(in srgb, ${badgeColor} 45%, transparent)` : "var(--color-line)"
                }`,
              }}
            >
              {selected && (
                <span
                  className="absolute -top-1.5 -right-1.5 flex items-center justify-center w-4 h-4 rounded-full text-micro font-bold leading-none"
                  style={{ color: "var(--color-surface)", backgroundColor: badgeColor }}
                >
                  {isMain ? "M" : position}
                </span>
              )}
              <RoleIcon role={specRole(spec)} size={14} />
              <span className="text-micro font-medium text-ink leading-none truncate max-w-full">{spec}</span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
      {specs.map((spec) => {
        const position = order.indexOf(spec);
        const selected = position !== -1;
        const isMain = position === 0;
        const badgeColor = isMain ? "var(--color-gold)" : "var(--color-secondary)";
        return (
          <button
            key={spec}
            type="button"
            onClick={() => onToggle(spec)}
            className="flex items-center justify-between gap-2 rounded-xl px-3.5 py-3 text-left transition-colors"
            style={{
              backgroundColor: selected
                ? `color-mix(in srgb, ${badgeColor} 14%, transparent)`
                : "var(--color-surface-2)",
              border: `1px solid ${
                selected ? `color-mix(in srgb, ${badgeColor} 45%, transparent)` : "var(--color-line)"
              }`,
            }}
          >
            <span className="flex items-center gap-2 min-w-0">
              <RoleIcon role={specRole(spec)} size={18} />
              <span className="text-sm font-medium text-ink truncate">{spec}</span>
            </span>
            {selected && (
              <span
                className="text-micro font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full shrink-0"
                style={{ color: badgeColor, backgroundColor: "var(--color-surface)" }}
              >
                {isMain ? "Main" : `Off-Spec ${position}`}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
