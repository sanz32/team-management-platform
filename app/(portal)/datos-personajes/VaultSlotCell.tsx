"use client";

import { parseItemLink, qualityNameFromIndex, wowheadParamsForItemLink } from "@/lib/wow-item-link";
import { qualityColor } from "@/lib/item-quality";
import type { VaultSlotView } from "@/lib/sync-display";

const CELL_SIZE = "w-11 h-11";

export default function VaultSlotCell({
  slot,
  categoryLabel,
  iconUrl,
}: {
  slot: VaultSlotView;
  categoryLabel: string;
  iconUrl: string | null;
}) {
  const parsed = parseItemLink(slot.itemLink);

  if (parsed) {
    const params = wowheadParamsForItemLink(parsed);
    const color = qualityColor(qualityNameFromIndex(parsed.qualityIndex));
    return (
      <a
        href={`https://www.wowhead.com/${params}`}
        data-wowhead={params}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex shrink-0"
      >
        <span
          className={`${CELL_SIZE} relative rounded-lg overflow-hidden flex items-center justify-center`}
          style={{ border: "1px solid color-mix(in srgb, var(--color-gold) 45%, var(--color-line))" }}
        >
          {iconUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={iconUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="w-full h-full block" style={{ backgroundColor: "var(--color-surface-2)" }} />
          )}
          <span
            className="absolute inset-x-0 bottom-0 text-center font-data text-micro font-bold leading-[14px]"
            style={{ color, backgroundColor: "rgba(8,10,16,0.78)" }}
          >
            {slot.itemLevel ?? "?"}
          </span>
        </span>
      </a>
    );
  }

  const progressText =
    slot.threshold != null ? `${slot.progress ?? 0}/${slot.threshold}` : null;
  const title = [categoryLabel, slot.tierLabel, progressText].filter(Boolean).join(" · ");

  return (
    <span className="inline-flex shrink-0" title={title}>
      <span
        className={`${CELL_SIZE} rounded-lg flex items-center justify-center`}
        style={{ backgroundColor: "var(--color-surface-2)", border: "1px solid var(--color-line)", opacity: 0.5 }}
      >
        <span className="font-data text-xs text-ink-faint">?</span>
      </span>
    </span>
  );
}
