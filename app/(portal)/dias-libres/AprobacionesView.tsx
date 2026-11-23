"use client";

import { Fragment, useEffect, useState } from "react";
import { Check, ShieldCheck, X } from "lucide-react";
import { cascadeStyle } from "@/lib/cascade";
import { useConfirm } from "../../components/ConfirmDialogProvider";
import RoleIcon from "../../components/RoleIcon";
import SwapExchangeCard, { SwapRequestDTO } from "./SwapExchangeCard";
import { readJsonBody } from "@/lib/read-json";
import LoadingState from "@/app/components/LoadingState";

interface RaidUnsaved {
  raidKey: string;
  abbr: string;
  color: string;
  unsaved: number;
  total: number;
}

interface MemberLockoutSummary {
  userId: string;
  name: string;
  characterCount: number;
  dominantRoles: string[];
  byDifficulty: { difficulty: "heroic" | "mythic"; raids: RaidUnsaved[] }[];
}

const DIFFICULTY_LABEL: Record<string, string> = { heroic: "HC", mythic: "M" };

const MATRIX_COLUMNS = { gridTemplateColumns: "1.25rem repeat(4, minmax(0, 1fr))" };

function LockoutMatrix({ summary }: { summary: MemberLockoutSummary }) {
  const header = summary.byDifficulty[0]?.raids ?? [];
  const hasCharacters = summary.characterCount > 0;

  return (
    <div className="grid gap-x-1 gap-y-1 items-center" style={MATRIX_COLUMNS}>
      <span />
      {header.map((raid) => (
        <span key={raid.raidKey} className="flex items-center justify-center gap-1 min-w-0">
          <span
            className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{ backgroundColor: raid.color }}
          />
          <span className="text-micro font-semibold text-ink-muted">{raid.abbr}</span>
        </span>
      ))}

      {summary.byDifficulty.map((row) => (
        <Fragment key={row.difficulty}>
          <span className="text-micro font-bold text-ink-faint">
            {DIFFICULTY_LABEL[row.difficulty]}
          </span>
          {row.raids.map((raid) => (
            <span
              key={raid.raidKey}
              className="font-data text-xs text-center rounded py-0.5 bg-surface-2 border border-line min-w-0"
              title={
                hasCharacters
                  ? `${raid.abbr} ${DIFFICULTY_LABEL[row.difficulty]}: ${raid.unsaved} de ${raid.total} personajes Unsaved`
                  : `${summary.name} no tiene personajes cargados`
              }
            >
              {hasCharacters ? (
                <>
                  <span className={raid.unsaved > 0 ? "font-bold text-ink" : "text-ink-faint"}>
                    {raid.unsaved}
                  </span>
                  <span className="text-ink-faint">/{raid.total}</span>
                </>
              ) : (
                <span className="text-ink-faint">—</span>
              )}
            </span>
          ))}
        </Fragment>
      ))}
    </div>
  );
}

function MemberLockouts({ summary }: { summary: MemberLockoutSummary | undefined }) {
  if (!summary) {
    return <p className="text-ink-faint text-xs">Sin datos de lockouts.</p>;
  }

  return (
    <>
      <div className="flex items-baseline gap-1.5 min-w-0">
        <span className="text-sm font-semibold text-ink truncate">{summary.name}</span>
        <span className="text-ink-faint text-xs font-normal whitespace-nowrap">
          · {summary.characterCount}
          {summary.characterCount === 1 ? " personaje" : " personajes"}
        </span>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap min-h-[22px] mb-2 mt-1">
        {summary.dominantRoles.length > 0 ? (
          summary.dominantRoles.map((role) => (
            <RoleIcon key={role} role={role} size={18} showLabel />
          ))
        ) : (
          <span className="text-ink-faint text-label">Sin rol definido</span>
        )}
      </div>

      <LockoutMatrix summary={summary} />
    </>
  );
}

function LockoutComparison({
  request,
  lockouts,
}: {
  request: SwapRequestDTO;
  lockouts: Record<string, MemberLockoutSummary>;
}) {
  return (
    <div className="hud-panel p-3 mt-3">
      <p className="text-caption !text-ink-faint mb-2.5">Personajes Unsaved esta semana</p>
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-3 sm:gap-4">
        <div className="min-w-0">
          <MemberLockouts summary={lockouts[request.requesterId]} />
        </div>
        <div className="hidden sm:block w-px self-stretch bg-line" aria-hidden />
        <div className="min-w-0">
          <MemberLockouts summary={lockouts[request.recipientId]} />
        </div>
      </div>
    </div>
  );
}

export default function AprobacionesView({
  onResolved,
}: {
  onResolved?: () => void | Promise<void>;
}) {
  const confirm = useConfirm();
  const [loading, setLoading] = useState(true);
  const [awaiting, setAwaiting] = useState<SwapRequestDTO[]>([]);
  const [resolved, setResolved] = useState<SwapRequestDTO[]>([]);
  const [lockouts, setLockouts] = useState<Record<string, MemberLockoutSummary>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function load() {
    const res = await fetch("/api/days-off/swap-approvals");
    const data = await readJsonBody(res);
    if (!res.ok) {
      setError(data.error || "No se pudo cargar la cola de aprobaciones.");
      setLoading(false);
      return;
    }
    setAwaiting(data.awaiting ?? []);
    setResolved(data.resolved ?? []);
    setLockouts(data.lockouts ?? {});
    setLoading(false);
  }

  useEffect(() => {
    (async () => {
      await load();
    })();
  }, []);

  async function decide(request: SwapRequestDTO, approve: boolean) {
    const confirmed = await confirm(
      approve
        ? `¿Aprobar el intercambio entre ${request.requesterName} y ${request.recipientName}? Se les cambian los días libres y se anuncia en Discord.`
        : `¿No aprobar el intercambio entre ${request.requesterName} y ${request.recipientName}? Cada uno conserva su día libre y se anuncia en Discord.`,
      {
        title: approve ? "Aprobar intercambio" : "No aprobar intercambio",
        confirmLabel: approve ? "Aprobar" : "No aprobar",
        danger: !approve,
      }
    );
    if (!confirmed) return;

    setBusyId(request.id);
    setError("");
    try {
      const res = await fetch(
        `/api/days-off/swap-requests/${request.id}/${approve ? "approve" : "deny"}`,
        { method: "PATCH" }
      );
      const data = await readJsonBody(res);
      if (!res.ok) {
        setError(data.error || "No se pudo resolver el intercambio.");
      }
      await load();
      await onResolved?.();
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(id: string) {
    const confirmed = await confirm(
      "¿Eliminar este intercambio del historial? Esta acción no se puede deshacer.",
      { danger: true, confirmLabel: "Eliminar" }
    );
    if (!confirmed) return;

    setBusyId(id);
    try {
      const res = await fetch(`/api/days-off/swap-requests/${id}`, { method: "DELETE" });
      if (res.ok) setResolved((prev) => prev.filter((r) => r.id !== id));
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <LoadingState count={4} />;

  return (
    <div className="space-y-8">
      {error && (
        <div
          className="text-sm rounded-xl p-3"
          style={{
            backgroundColor: "color-mix(in srgb, var(--color-danger) 12%, transparent)",
            border: "1px solid color-mix(in srgb, var(--color-danger) 35%, transparent)",
            color: "var(--color-danger)",
          }}
        >
          {error}
        </div>
      )}

      <section>
        <h2 className="font-heading text-lg font-bold text-ink mb-1">Esperando tu decisión</h2>
        <p className="text-ink-muted text-sm mb-4">
          Los dos miembros ya se pusieron de acuerdo. Revisa cuántos personajes le quedan Unsaved a
          cada uno antes de resolver.
        </p>

        {awaiting.length === 0 ? (
          <div className="card px-6 py-12 text-center">
            <ShieldCheck className="w-8 h-8 mx-auto mb-3" style={{ color: "var(--color-ink-faint)" }} />
            <p className="text-ink-muted text-sm">No hay intercambios esperando aprobación.</p>
            <p className="text-ink-faint text-xs mt-1">
              Cuando dos miembros acuerden un cambio, aparece acá y se avisa en Discord.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {awaiting.map((r, index) => (
              <div key={r.id} className="cascade-item" style={cascadeStyle(index)}>
                <SwapExchangeCard request={r} accent collapsible busy={busyId === r.id}>
                  <LockoutComparison request={r} lockouts={lockouts} />
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-line">
                    <button
                      type="button"
                      onClick={() => decide(r, true)}
                      disabled={busyId === r.id}
                      className="btn btn-primary !py-1.5 !px-3 text-xs inline-flex items-center gap-1.5"
                    >
                      <Check className="w-3.5 h-3.5" />
                      Aprobar
                    </button>
                    <button
                      type="button"
                      onClick={() => decide(r, false)}
                      disabled={busyId === r.id}
                      className="btn btn-danger !py-1.5 !px-3 text-xs inline-flex items-center gap-1.5"
                    >
                      <X className="w-3.5 h-3.5" />
                      No aprobar
                    </button>
                  </div>
                </SwapExchangeCard>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="font-heading text-lg font-bold text-ink mb-1">Historial</h2>
        <p className="text-ink-muted text-sm mb-4">
          Todos los intercambios ya resueltos del guild.
        </p>

        {resolved.length === 0 ? (
          <div className="card px-6 py-10 text-center text-ink-faint text-sm">
            Todavía no se resolvió ningún intercambio.
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            {resolved.map((r, index) => (
              <div key={r.id} className="cascade-item" style={cascadeStyle(index)}>
                <SwapExchangeCard
                  request={r}
                  collapsible
                  busy={busyId === r.id}
                  onDelete={() => handleDelete(r.id)}
                />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
