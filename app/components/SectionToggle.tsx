"use client";

import { ChevronDown } from "lucide-react";
import IconBadge from "./dashboard/IconBadge";

export default function SectionToggle({
  icon,
  title,
  hint,
  open,
  onToggle,
  openLabel = "Ocultar",
  closedLabel = "Mostrar",
  color = "var(--color-primary)",
}: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  title: string;
  hint?: string;
  open: boolean;
  onToggle: () => void;
  openLabel?: string;
  closedLabel?: string;
  color?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="w-full flex items-center justify-between gap-4 text-left"
    >
      <span className="flex items-center gap-3 min-w-0">
        <IconBadge icon={icon} color={color} />
        <span className="min-w-0">
          <span className="font-heading font-semibold text-ink block truncate">{title}</span>
          {hint && <span className="text-ink-faint text-xs block truncate">{hint}</span>}
        </span>
      </span>
      <span className="flex items-center gap-1.5 text-xs font-semibold text-ink-faint shrink-0">
        {open ? openLabel : closedLabel}
        <ChevronDown
          className="w-4 h-4 transition-transform duration-200"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
        />
      </span>
    </button>
  );
}
