"use client";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  sublabel?: string;
  badge?: number;
}

export default function SegmentedToggle<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="inline-flex rounded-lg p-0.5 gap-0.5"
      style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-line)" }}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className="relative flex-1 rounded-md px-3 py-1.5 text-center transition-colors duration-200"
            style={{
              backgroundColor: active
                ? "color-mix(in srgb, var(--color-primary) 22%, transparent)"
                : "transparent",
              boxShadow: active
                ? "0 0 8px 0 color-mix(in srgb, var(--color-primary) 40%, transparent)"
                : "none",
            }}
          >
            <p
              className="font-heading font-bold text-sm leading-tight whitespace-nowrap"
              style={{ color: active ? "var(--color-primary)" : "var(--color-ink-muted)" }}
            >
              {opt.label}
            </p>
            {opt.sublabel && (
              <p
                className="text-micro font-data leading-tight"
                style={{ color: active ? "var(--color-primary)" : "var(--color-ink-faint)" }}
              >
                {opt.sublabel}
              </p>
            )}
            {!!opt.badge && (
              <span
                className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full text-micro font-bold flex items-center justify-center text-white"
                style={{ backgroundColor: "var(--color-danger)" }}
              >
                {opt.badge > 9 ? "9+" : opt.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
