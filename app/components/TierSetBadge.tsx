"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { TierPiece, TierSetGroup } from "@/lib/tier-set";

interface SizeStyle {
  wrapper: string;
  iconSize: string;
}

const SIZE_CONFIG: Record<"sm" | "md" | "lg", SizeStyle> = {
  sm: { wrapper: "h-[18px] px-1.5 text-micro", iconSize: "w-7 h-7" },
  md: { wrapper: "h-6 px-2 text-xs", iconSize: "w-8 h-8" },
  lg: { wrapper: "h-7 px-2.5 text-sm", iconSize: "w-8 h-8" },
};

const PANEL_WIDTH = 248;
const VIEWPORT_MARGIN = 8;
const SET_HEADER_HEIGHT = 26;
const PIECE_ROW_HEIGHT = 36;
const PANEL_PADDING = 24;

function isValidSet(value: unknown): value is TierSetGroup {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<TierSetGroup>;
  return typeof v.setId === "number" && typeof v.setName === "string" && Array.isArray(v.pieces);
}

function looksLikeLegacyPiece(value: unknown): value is TierPiece {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<TierPiece>;
  return typeof v.itemId === "number" && typeof v.equipped === "boolean" && !("pieces" in v);
}

function normalizeSets(
  raw: unknown,
  count: number | null,
  legacySetName: string | null
): TierSetGroup[] {
  const arr = Array.isArray(raw) ? raw : [];
  if (arr.length === 0) return [];
  if (arr.every(isValidSet)) return arr;
  if (arr.every(looksLikeLegacyPiece)) {
    return [
      {
        setId: 0,
        setName: legacySetName ?? "Set de Tier",
        count: count ?? arr.filter((piece) => piece.equipped).length,
        pieces: arr,
      },
    ];
  }
  return [];
}

function badgeLabel(count: number | null): string {
  return count != null ? `${count}p` : "—p";
}

function fallbackTitle(count: number | null): string {
  if (count == null) return "Piezas de Tier: sin calcular. Actualiza el Armory del personaje.";
  if (count === 0) return "Sin ninguna pieza de tier set equipada";
  return `${count} piezas de Tier`;
}

function TierPieceRow({ piece, iconSize }: { piece: TierPiece; iconSize: string }) {
  return (
    <li className="flex items-center gap-2.5">
      <div
        className={`${iconSize} shrink-0 rounded-md overflow-hidden`}
        style={{
          backgroundColor: "var(--color-line)",
          border: piece.equipped
            ? "1px solid color-mix(in srgb, var(--color-tier) 70%, transparent)"
            : "1px solid var(--color-line)",
          filter: piece.equipped ? undefined : "grayscale(1)",
          opacity: piece.equipped ? 1 : 0.4,
        }}
      >
        {piece.iconUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={piece.iconUrl} alt="" className="w-full h-full object-cover" />
        )}
      </div>
      <span
        className="text-label leading-tight line-clamp-2 min-w-0"
        style={{ color: piece.equipped ? "var(--color-ink)" : "var(--color-ink-faint)" }}
      >
        {piece.name}
      </span>
    </li>
  );
}

function TierSetSection({ set, iconSize }: { set: TierSetGroup; iconSize: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <span className="font-data text-micro uppercase tracking-[0.12em] text-ink-faint truncate">
          {set.setName}
        </span>
        <span className="font-data text-label font-bold" style={{ color: "var(--color-tier)" }}>
          {set.count}/{set.pieces.length}
        </span>
      </div>
      <ul className="flex flex-col gap-1.5">
        {set.pieces.map((piece) => (
          <TierPieceRow key={piece.itemId} piece={piece} iconSize={iconSize} />
        ))}
      </ul>
    </div>
  );
}

export default function TierSetBadge({
  count,
  sets,
  legacySetName = null,
  size = "sm",
}: {
  count: number | null;
  sets: TierSetGroup[] | null;
  legacySetName?: string | null;
  size?: keyof typeof SIZE_CONFIG;
}) {
  const config = SIZE_CONFIG[size];
  const validSets = normalizeSets(sets, count, legacySetName);
  const hasPanel = validSets.length > 0;
  const isTransition = validSets.length > 1;

  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const [panelPos, setPanelPos] = useState<{ top: number; left: number; below: boolean } | null>(null);

  const openPanel = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const estimatedHeight =
      PANEL_PADDING +
      validSets.reduce((sum, set) => sum + SET_HEADER_HEIGHT + set.pieces.length * PIECE_ROW_HEIGHT, 0);
    const below = rect.top < estimatedHeight + VIEWPORT_MARGIN;
    const rawLeft = rect.left + rect.width / 2 - PANEL_WIDTH / 2;
    setPanelPos({
      top: below ? rect.bottom + 8 : rect.top - 8,
      left: Math.min(
        Math.max(VIEWPORT_MARGIN, rawLeft),
        window.innerWidth - PANEL_WIDTH - VIEWPORT_MARGIN
      ),
      below,
    });
  }, [validSets]);

  const closePanel = useCallback(() => setPanelPos(null), []);

  useEffect(() => {
    if (!panelPos) return;
    window.addEventListener("scroll", closePanel, true);
    return () => window.removeEventListener("scroll", closePanel, true);
  }, [panelPos, closePanel]);

  const badge = (
    <span
      className={`shrink-0 inline-flex items-center rounded-full font-data font-bold leading-none ${config.wrapper}`}
      style={{
        color: "var(--color-tier)",
        backgroundColor: "color-mix(in srgb, var(--color-tier) 14%, transparent)",
        border: "1px solid color-mix(in srgb, var(--color-tier) 34%, transparent)",
      }}
    >
      {isTransition ? (
        validSets.map((set, index) => (
          <span key={set.setId} className="inline-flex items-center">
            {index > 0 && <span className="mx-1 opacity-50">·</span>}
            <span
              style={
                index === 0
                  ? undefined
                  : { color: "color-mix(in srgb, var(--color-tier) 45%, var(--color-ink-faint) 55%)" }
              }
            >
              {set.count}p
            </span>
          </span>
        ))
      ) : (
        <>{badgeLabel(count)}</>
      )}
    </span>
  );

  if (!hasPanel) {
    return (
      <span title={fallbackTitle(count)} className="inline-flex">
        {badge}
      </span>
    );
  }

  return (
    <span
      ref={anchorRef}
      className="relative inline-flex"
      tabIndex={0}
      aria-label={validSets
        .map((set) => `${set.count} de ${set.pieces.length} piezas de ${set.setName} equipadas`)
        .join(" · ")}
      onMouseEnter={openPanel}
      onMouseLeave={closePanel}
      onFocus={openPanel}
      onBlur={closePanel}
    >
      {badge}
      {panelPos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            role="tooltip"
            className="pointer-events-none fixed z-[100] rounded-lg p-3"
            style={{
              top: panelPos.top,
              left: panelPos.left,
              width: PANEL_WIDTH,
              transform: panelPos.below ? undefined : "translateY(-100%)",
              backgroundColor: "color-mix(in srgb, var(--color-canvas) 96%, transparent)",
              border: "1px solid var(--color-line-strong)",
              boxShadow: "0 12px 28px rgba(0,0,0,0.45)",
              backdropFilter: "blur(6px)",
            }}
          >
            <div className="flex flex-col gap-3">
              {validSets.map((set, index) => (
                <div
                  key={set.setId}
                  className={index > 0 ? "pt-3 border-t border-line" : ""}
                >
                  <TierSetSection set={set} iconSize={config.iconSize} />
                </div>
              ))}
            </div>
          </div>,
          document.body
        )}
    </span>
  );
}
