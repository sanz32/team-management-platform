"use client";

import Link from "next/link";
import { AlertTriangle, RotateCw, Home } from "lucide-react";

export default function ErrorScreen({
  title = "Algo se rompió de este lado",
  message = "La pantalla no pudo cargar sus datos. No perdiste nada de lo que hayas guardado antes.",
  digest,
  onRetry,
  showHome = true,
}: {
  title?: string;
  message?: string;
  digest?: string;
  onRetry?: () => void;
  showHome?: boolean;
}) {
  return (
    <div className="portal-container is-narrow py-20">
      <div className="flex flex-col items-center text-center gap-5">
        <span
          className="w-14 h-14 rounded-lg flex items-center justify-center shrink-0"
          style={{
            border: "1px solid color-mix(in srgb, var(--color-danger) 45%, transparent)",
            backgroundColor: "color-mix(in srgb, var(--color-danger) 12%, transparent)",
          }}
        >
          <AlertTriangle className="w-6 h-6" style={{ color: "var(--color-danger)" }} />
        </span>

        <div className="flex flex-col gap-2.5">
          <h1 className="page-title" style={{ fontSize: "clamp(1.75rem, 4vw, 2.5rem)" }}>
            {title}
          </h1>
          <p className="text-sm text-ink-muted max-w-[46ch] mx-auto leading-relaxed">{message}</p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap justify-center">
          {onRetry && (
            <button type="button" onClick={onRetry} className="btn btn-primary">
              <RotateCw className="w-4 h-4" />
              Reintentar
            </button>
          )}
          {showHome && (
            <Link href="/" className="btn btn-secondary">
              <Home className="w-4 h-4" />
              Ir a Inicio
            </Link>
          )}
        </div>

        {digest && (
          <p className="font-data text-micro text-ink-faint mt-1">
            Referencia del error: <span className="text-ink-muted select-all">{digest}</span>
          </p>
        )}
      </div>
    </div>
  );
}
