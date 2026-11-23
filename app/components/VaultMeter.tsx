"use client";

import type { VaultGroup } from "@/lib/sync-display";

export default function VaultMeter({
  group,
  squareSize = 10,
  stacked = false,
  showLabel = true,
}: {
  group: VaultGroup;
  squareSize?: number;
  stacked?: boolean;
  showLabel?: boolean;
}) {
  const squares = (
    <span className="flex items-center gap-[4px] shrink-0">
      {group.slots.map((slot, i) => (
        <span
          key={i}
          className="rounded-[3px]"
          style={{
            width: squareSize,
            height: squareSize,
            ...(slot.unlocked
              ? {
                  backgroundColor: slot.color ?? "var(--color-ink-faint)",
                  ...(slot.accent ? { boxShadow: `inset 0 0 0 1.5px ${slot.accent}` } : {}),
                }
              : { border: "1px solid var(--color-line-strong)" }),
          }}
        />
      ))}
    </span>
  );

  const title = group.detail ?? `${group.label}: sin datos`;

  if (!showLabel) {
    return (
      <span className="flex items-center min-w-0" title={title}>
        {squares}
      </span>
    );
  }

  if (stacked) {
    return (
      <span className="flex flex-col items-center gap-1 min-w-0" title={title}>
        <span className="text-label text-ink-muted truncate max-w-full">{group.label}</span>
        {squares}
      </span>
    );
  }

  return (
    <span className="flex items-center gap-1.5 min-w-0" title={title}>
      <span className="text-label text-ink-muted shrink-0">{group.label}</span>
      {squares}
    </span>
  );
}
