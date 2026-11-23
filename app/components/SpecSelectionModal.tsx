"use client";

import { useState } from "react";
import { ALL_CLASSES } from "@/lib/wow-classes";
import SpecOrderPicker from "./SpecOrderPicker";
import { useModalDismiss } from "@/lib/useModalDismiss";

export default function SpecSelectionModal({
  wowClass,
  initialSpecs = [],
  onConfirm,
  onCancel,
}: {
  wowClass: string | null;
  initialSpecs?: string[];
  onConfirm: (specNames: string[], resolvedClass: string) => void;
  onCancel: () => void;
}) {
  const panelRef = useModalDismiss<HTMLDivElement>(onCancel);
  const [chosenClass, setChosenClass] = useState<string | null>(wowClass);
  const [order, setOrder] = useState<string[]>(initialSpecs);

  function toggleSpec(spec: string) {
    setOrder((prev) => (prev.includes(spec) ? prev.filter((s) => s !== spec) : [...prev, spec]));
  }

  function handleConfirm() {
    if (!chosenClass || order.length === 0) return;
    onConfirm(order, chosenClass);
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(5, 3, 10, 0.72)", backdropFilter: "blur(2px)" }}
      onClick={onCancel}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Elige la especialización"
        className="card p-6 max-w-lg w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-heading text-lg font-bold text-ink mb-2">Elige la especialización</h2>

        {!chosenClass ? (
          <>
            <p className="text-ink-muted text-sm leading-relaxed mb-4">
              No se pudo determinar la clase de este personaje automáticamente. Elígela para poder
              mostrar sus especializaciones.
            </p>
            <select
              value=""
              onChange={(e) => setChosenClass(e.target.value)}
              className="input px-3 py-2 text-sm w-full"
            >
              <option value="" disabled>
                Elige una clase...
              </option>
              {ALL_CLASSES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </>
        ) : (
          <>
            <p className="text-ink-muted text-sm leading-relaxed mb-4">
              Elige qué especialización(es) juega este personaje para el guild. La primera que
              elijas es su <span className="font-semibold text-ink">Main</span>; las siguientes
              quedan como <span className="font-semibold text-ink">Off-Spec</span>.
            </p>
            <SpecOrderPicker wowClass={chosenClass} order={order} onToggle={toggleSpec} />
          </>
        )}

        <div className="flex gap-3 mt-6 justify-end">
          <button type="button" onClick={onCancel} className="btn btn-ghost">
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!chosenClass || order.length === 0}
            className="btn btn-primary"
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}
