"use client";

import { useState } from "react";
import { ChevronDown, Stethoscope } from "lucide-react";
import type { RosterDiagnostics } from "@/lib/roster-generator";
import { cascadeStyle } from "@/lib/cascade";

export default function AutoDiagnosticsPanel({
  diagnostics,
}: {
  diagnostics: RosterDiagnostics;
}) {
  const [open, setOpen] = useState(false);

  const {
    unfilledSlots,
    unmetClassMins,
    exceededClassMaxes,
    lastResortUsed,
    offMainClassUsed,
    charactersWithoutClass,
    capViolations,
  } = diagnostics;

  const issueCount =
    unfilledSlots.length +
    unmetClassMins.length +
    exceededClassMaxes.length +
    capViolations.length;
  const noteCount = lastResortUsed.length + offMainClassUsed.length + (charactersWithoutClass ? 1 : 0);

  return (
    <div className="card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
      >
        <Stethoscope size={16} className="text-ink-muted shrink-0" />
        <span className="text-sm font-semibold flex-1">
          Por qué salió así este roster
          {issueCount > 0 && (
            <span className="ml-2 text-xs font-medium" style={{ color: "var(--color-gold)" }}>
              {issueCount} {issueCount === 1 ? "pendiente" : "pendientes"}
            </span>
          )}
          {issueCount === 0 && noteCount > 0 && (
            <span className="ml-2 text-xs font-medium text-ink-faint">
              {noteCount} {noteCount === 1 ? "nota" : "notas"}
            </span>
          )}
        </span>
        <ChevronDown
          size={16}
          className="text-ink-faint shrink-0 transition-transform"
          style={{ transform: open ? "rotate(180deg)" : undefined }}
        />
      </button>

      {open && (
        <div className="px-4 pb-4 pt-1 space-y-4 border-t border-line">
          {issueCount === 0 && noteCount === 0 && (
            <p className="text-xs text-ink-faint pt-3">
              El roster cumple todo lo que pediste, sin compromisos que valga la pena señalar.
            </p>
          )}

          <Section title="Cupos sin llenar" items={unfilledSlots} index={0}>
            {(s) => `${s.role}: faltan ${s.count}`}
          </Section>

          <Section title="Clases por debajo de lo pedido" items={unmetClassMins} index={1}>
            {(c) => `${c.class}: ${c.got} de ${c.needed}`}
          </Section>

          <Section title="Clases por encima del máximo" items={exceededClassMaxes} index={2}>
            {(c) => `${c.class}: ${c.got}, el máximo era ${c.max}`}
          </Section>

          <Section title="Se pasó del cupo de saved/unsaved" items={capViolations} index={3}>
            {(c) => `${c.type}: ${c.over} de más`}
          </Section>

          <Section title="Personajes de último recurso" items={lastResortUsed} index={4}>
            {(r) => `${r.characterName} (${r.discordUsername}) — ${r.reason}`}
          </Section>

          <Section title="Fuera de su clase main" items={offMainClassUsed} index={5}>
            {(r) =>
              `${r.discordUsername} juega ${r.playedClass}` +
              (r.mainClasses.length > 0 ? ` en vez de ${r.mainClasses.join(" / ")}` : "") +
              ` — ${r.reason}`
            }
          </Section>

          {charactersWithoutClass > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-ink-muted mb-1.5">Sin clase sincronizada</h4>
              <p className="text-xs text-ink-faint">
                {charactersWithoutClass}{" "}
                {charactersWithoutClass === 1 ? "personaje elegido no tiene" : "personajes elegidos no tienen"}{" "}
                clase cargada desde Blizzard, así que no pueden cubrir ningún requisito de clase.
                Refresca los personajes para corregirlo.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Section<T>({
  title,
  items,
  index,
  children,
}: {
  title: string;
  items: T[];
  index: number;
  children: (item: T) => string;
}) {
  if (items.length === 0) return null;
  return (
    <div className="cascade-item" style={cascadeStyle(index)}>
      <h4 className="text-xs font-semibold text-ink-muted mb-1.5">{title}</h4>
      <ul className="space-y-1">
        {items.map((item, i) => (
          <li key={i} className="text-xs text-ink-faint">
            {children(item)}
          </li>
        ))}
      </ul>
    </div>
  );
}
