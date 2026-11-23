"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { X, ArrowRight, Wrench, Sparkles, Rocket } from "lucide-react";

const subscribeNoop = () => () => {};
function useHasMounted() {
  return useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false
  );
}

const REFERENCE_WIDTH = 2560;
const MIN_SCALE = 0.7;
const MAX_SCALE = 1.3;

function computeModalScale(): number {
  if (typeof window === "undefined") return 1;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, window.innerWidth / REFERENCE_WIDTH));
}

function formatPublishedDate(iso: string): string {
  return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", year: "numeric" }).format(
    new Date(iso)
  );
}

const MODULE_LABELS: Record<string, string> = {
  "/characters": "Personajes",
  "/roster": "Roster",
  "/balance": "Balance",
  "/balance/administrar": "Balance",
  "/runs-ob": "Runs OB",
  "/cuentas": "Cuentas",
};
function moduleLabel(featurePath: string): string {
  return MODULE_LABELS[featurePath] ?? "Portal";
}

const LEADING_ICON_RE = /^\[icon:([^\]]+)\]\s*(.*)$/;
const LEADING_EMOJI_RE = /^(\p{Extended_Pictographic}️?)\s*(.*)$/u;

type Marker = { kind: "emoji"; value: string } | { kind: "icon"; url: string } | null;

function MessageBody({ message }: { message: string }) {
  const lines = message
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length <= 1) {
    return <p className="text-ink-muted text-sm leading-relaxed">{message}</p>;
  }

  const parsed = lines.map((line) => {
    const iconMatch = line.match(LEADING_ICON_RE);
    if (iconMatch) return { marker: { kind: "icon", url: iconMatch[1] } as Marker, text: iconMatch[2] };
    const emojiMatch = line.match(LEADING_EMOJI_RE);
    if (emojiMatch) return { marker: { kind: "emoji", value: emojiMatch[1] } as Marker, text: emojiMatch[2] };
    return { marker: null as Marker, text: line };
  });

  if (!parsed.some((p) => p.marker)) {
    return (
      <ul className="space-y-2">
        {lines.map((line, i) => (
          <li key={i} className="flex items-start gap-2.5 text-ink-muted text-sm leading-relaxed">
            <span className="mt-2 w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: "var(--color-primary)" }} />
            {line}
          </li>
        ))}
      </ul>
    );
  }

  type Item = { marker: Marker; text: string };
  type Block = { type: "p"; text: string } | { type: "ul"; items: Item[] };
  const blocks: Block[] = [];
  for (const item of parsed) {
    if (item.marker) {
      const last = blocks[blocks.length - 1];
      if (last?.type === "ul") {
        last.items.push(item as Item);
      } else {
        blocks.push({ type: "ul", items: [item as Item] });
      }
    } else {
      blocks.push({ type: "p", text: item.text });
    }
  }

  return (
    <div className="space-y-3">
      {blocks.map((block, i) =>
        block.type === "p" ? (
          <p key={i} className="text-ink-muted text-sm leading-relaxed">
            {block.text}
          </p>
        ) : (
          <ul key={i} className="space-y-2">
            {block.items.map((item, j) => (
              <li key={j} className="flex items-center gap-2.5 text-ink-muted text-sm leading-relaxed">
                {item.marker?.kind === "icon" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.marker.url} alt="" className="w-5 h-5 rounded shrink-0 object-cover" />
                ) : (
                  <span className="shrink-0 leading-none text-base">{item.marker?.value}</span>
                )}
                {item.text}
              </li>
            ))}
          </ul>
        )
      )}
    </div>
  );
}

export default function UpdateModal({
  updateId,
  title,
  message,
  featurePath,
  imageUrl,
  createdAt,
}: {
  updateId: string;
  title: string;
  message: string;
  featurePath: string;
  imageUrl: string | null;
  createdAt: string;
}) {
  const [dismissed, setDismissed] = useState(false);
  const mounted = useHasMounted();
  const [scale, setScale] = useState(() => computeModalScale());
  useEffect(() => {
    function onResize() {
      setScale(computeModalScale());
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  async function ack(payload: { dismiss?: boolean; visit?: boolean }) {
    try {
      await fetch("/api/product-updates/ack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updateId, ...payload }),
      });
    } catch {
    }
  }

  function handleClose() {
    setDismissed(true);
    ack({ dismiss: true });
  }

  function handleGo() {
    setDismissed(true);
    ack({ dismiss: true, visit: true });
  }

  useEffect(() => {
    if (dismissed) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") handleClose();
    }
    document.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dismissed]);

  if (dismissed || !mounted) return null;

  return createPortal(
    <div
      className="update-modal-backdrop fixed inset-0 z-[95] flex items-center justify-center p-4 md:p-8"
      style={{ backgroundColor: "rgba(5, 3, 10, 0.72)", backdropFilter: "blur(6px)" }}
      onClick={handleClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="update-modal-title"
        onClick={(e) => e.stopPropagation()}
        className="update-modal-panel relative w-full max-w-[650px] rounded-2xl shadow-2xl"
        style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-line)", zoom: scale }}
      >
        <button
          type="button"
          onClick={handleClose}
          title="Cerrar"
          className="absolute top-4 right-4 z-10 w-9 h-9 rounded-full flex items-center justify-center text-ink-muted hover:text-ink transition-colors hover:bg-[color:var(--color-surface-2)]"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="p-6 md:p-7">
          <p className="flex items-center gap-1.5 text-ink-faint text-label font-bold uppercase tracking-wide mb-1">
            <Wrench className="w-3 h-3 shrink-0" />
            Notas de actualización — Team Portal
          </p>
          <p className="text-ink-faint text-xs mb-4">
            Módulo: {moduleLabel(featurePath)} · Se publicó el {formatPublishedDate(createdAt)}
          </p>

          <div className="border-t border-line mb-4" />

          <h2
            id="update-modal-title"
            className="font-heading text-xl md:text-2xl font-bold text-ink mb-4 flex items-center gap-2"
          >
            <Sparkles className="w-5 h-5 shrink-0" style={{ color: "var(--color-primary)" }} />
            {title}
          </h2>

          <MessageBody message={message} />

          {imageUrl && (
            <a href={imageUrl} target="_blank" rel="noopener noreferrer" className="block mt-8 mb-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageUrl}
                alt=""
                className="w-full h-auto rounded-lg border border-line"
              />
            </a>
          )}

          <div className="border-t border-line my-5" />

          <p className="flex items-center justify-center gap-1.5 text-ink-faint text-xs text-center mb-5">
            ¡Gracias por seguir siendo parte del equipo!
            <Rocket className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--color-primary)" }} />
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              href={featurePath}
              onClick={handleGo}
              className="btn btn-primary inline-flex items-center gap-1.5"
            >
              Ver novedad
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
            <button type="button" onClick={handleClose} className="btn btn-ghost">
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
