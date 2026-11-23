"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { useModalDismiss } from "@/lib/useModalDismiss";

interface ConfirmOptions {
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

type ConfirmFn = (message: string, options?: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm debe usarse dentro de <ConfirmDialogProvider>");
  return ctx;
}

interface PendingConfirm {
  message: string;
  options: ConfirmOptions;
}

export default function ConfirmDialogProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((message, options = {}) => {
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setPending({ message, options });
    });
  }, []);

  const respond = useCallback((value: boolean) => {
    resolverRef.current?.(value);
    resolverRef.current = null;
    setPending(null);
  }, []);

  const panelRef = useModalDismiss<HTMLDivElement>(() => respond(false), !!pending);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(5, 3, 10, 0.72)", backdropFilter: "blur(2px)" }}
          onClick={() => respond(false)}
        >
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={pending.options.title ?? "Confirmar acción"}
            className="card p-6 max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            {pending.options.title && (
              <h2 className="font-heading text-lg font-bold text-ink mb-2">{pending.options.title}</h2>
            )}
            <p className="text-ink-muted text-sm leading-relaxed whitespace-pre-line">{pending.message}</p>
            <div className="flex gap-3 mt-6 justify-end">
              <button type="button" onClick={() => respond(false)} className="btn btn-ghost">
                {pending.options.cancelLabel ?? "Cancelar"}
              </button>
              <button
                type="button"
                onClick={() => respond(true)}
                autoFocus
                className={`btn ${pending.options.danger ? "btn-danger" : "btn-primary"}`}
              >
                {pending.options.confirmLabel ?? "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
