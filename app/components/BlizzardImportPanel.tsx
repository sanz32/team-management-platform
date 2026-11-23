"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { RotateCw, Users, KeyRound } from "lucide-react";
import { classColor } from "@/lib/wow-classes";
import { factionLabel } from "@/lib/faction";
import SpecOrderPicker from "./SpecOrderPicker";
import { cascadeStyle } from "@/lib/cascade";
import { readJson } from "@/lib/read-json";
import { buildWowAccountLabels } from "@/lib/wow-accounts";
import { useConfirm } from "./ConfirmDialogProvider";

const BLIZZARD_OAUTH_ERROR_LABELS: Record<string, string> = {
  no_autenticado: "Tu sesión expiró. Vuelve a iniciar sesión e intenta de nuevo.",
  estado_invalido: "La conexión se interrumpió (estado inválido). Intenta de nuevo.",
  intercambio_token: "Battle.net rechazó la autorización. Intenta de nuevo.",
  guardado: "Se autorizó tu cuenta pero no se pudo guardar la conexión. Intenta de nuevo.",
};

interface Candidate {
  name: string;
  realmSlug: string;
  realmName: string;
  region: string;
  level: number;
  class: string | null;
  faction: string | null;
  alreadyAdded: boolean;
  wowAccountNumber: number | null;
}

function candidateKey(c: Candidate): string {
  return `${c.name.toLowerCase()}-${c.realmSlug.toLowerCase()}-${c.region.toLowerCase()}`;
}

interface CandidateGroup {
  label: string | null;
  color: string | null;
  items: Candidate[];
}

function groupCandidatesByAccount(candidates: Candidate[]): CandidateGroup[] {
  const labels = buildWowAccountLabels(candidates.map((c) => c.wowAccountNumber));
  if (labels.size === 0) return [{ label: null, color: null, items: candidates }];

  const byAccount = new Map<number, Candidate[]>();
  const unknown: Candidate[] = [];
  for (const c of candidates) {
    if (c.wowAccountNumber != null && labels.has(c.wowAccountNumber)) {
      const arr = byAccount.get(c.wowAccountNumber) ?? [];
      arr.push(c);
      byAccount.set(c.wowAccountNumber, arr);
    } else {
      unknown.push(c);
    }
  }

  const sortedNumbers = Array.from(byAccount.keys()).sort((a, b) => a - b);
  const groups: CandidateGroup[] = sortedNumbers.map((number) => ({
    label: labels.get(number)!.full,
    color: labels.get(number)!.color,
    items: byAccount.get(number)!,
  }));
  if (unknown.length > 0) {
    groups.push({ label: "Sin identificar", color: "var(--color-ink-faint)", items: unknown });
  }
  return groups;
}

interface BlizzardCharactersResponse {
  connected?: boolean;
  candidates?: Candidate[];
  battletag?: string | null;
  error?: string;
  minLevel?: number;
}

export function useBlizzardImport(onImported: () => void) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [chosenSpecs, setChosenSpecs] = useState<Record<string, string[]>>({});
  const [error, setError] = useState("");
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [battletag, setBattletag] = useState<string | null>(null);
  const [minLevel, setMinLevel] = useState(80);
  const [awaitingAccountChoice, setAwaitingAccountChoice] = useState(false);
  const [awaitingReauth, setAwaitingReauth] = useState(false);
  const [switchingAccount, setSwitchingAccount] = useState(false);
  const [instructionsAcknowledged, setInstructionsAcknowledged] = useState(false);

  async function handleSync(skipAccountConfirm = false) {
    setOpen(true);
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/blizzard/characters");
      const data = await readJson<BlizzardCharactersResponse>(res);
      if (!res.ok || !data) {
        throw new Error(
          data?.error || "No se pudo consultar tu cuenta de Blizzard. Intenta de nuevo en un momento."
        );
      }
      if (!data.connected) {
        window.location.href = "/api/blizzard/oauth/start";
        return;
      }
      setBattletag(data.battletag ?? null);
      setCandidates(data.candidates ?? []);
      if (data.minLevel != null) setMinLevel(data.minLevel);
      setChosenSpecs({});
      setInstructionsAcknowledged(false);
      setAwaitingAccountChoice(!skipAccountConfirm);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo consultar tu cuenta de Blizzard.");
    } finally {
      setLoading(false);
    }
  }

  function confirmSameAccount() {
    setAwaitingAccountChoice(false);
  }

  function handleCancel() {
    setOpen(false);
    setError("");
    setAwaitingAccountChoice(false);
    setAwaitingReauth(false);
  }

  function requestOtherAccount() {
    setAwaitingAccountChoice(false);
    setAwaitingReauth(true);
  }

  function cancelReauth() {
    setAwaitingReauth(false);
    setAwaitingAccountChoice(true);
  }

  async function confirmOtherAccount() {
    setSwitchingAccount(true);
    try {
      await fetch("/api/blizzard/oauth/disconnect", { method: "POST" });
    } catch (err) {
      console.error("Error desconectando cuenta de Blizzard:", err);
    }
    window.location.href = "/api/blizzard/oauth/start";
  }

  useEffect(() => {
    const connectedFlag = searchParams.get("blizzard_connected");
    const errorFlag = searchParams.get("blizzard_error");
    if (connectedFlag) {
      router.replace("/characters", { scroll: false });
      // eslint-disable-next-line react-hooks/set-state-in-effect
      handleSync(true);
    } else if (errorFlag) {
      router.replace("/characters", { scroll: false });
      setOpen(true);
      setError(BLIZZARD_OAUTH_ERROR_LABELS[errorFlag] ?? "No se pudo conectar tu cuenta de Blizzard.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleSpec(key: string, spec: string) {
    setChosenSpecs((prev) => {
      const current = prev[key] ?? [];
      const next = current.includes(spec) ? current.filter((s) => s !== spec) : [...current, spec];
      return { ...prev, [key]: next };
    });
  }

  const readyToImport = candidates.filter((c) => !c.alreadyAdded && (chosenSpecs[candidateKey(c)]?.length ?? 0) > 0);

  async function handleImport() {
    setImporting(true);
    setError("");
    setProgress({ done: 0, total: readyToImport.length });

    for (let i = 0; i < readyToImport.length; i++) {
      const candidate = readyToImport[i];
      const specNames = chosenSpecs[candidateKey(candidate)] ?? [];
      try {
        await fetch("/api/characters", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: candidate.name,
            realm_slug: candidate.realmSlug,
            region: candidate.region,
            class: candidate.class,
            faction: candidate.faction,
            specNames,
            wow_account_number: candidate.wowAccountNumber,
          }),
        });
      } catch (err) {
        console.error("Error importando personaje desde Blizzard:", err);
      }
      setProgress({ done: i + 1, total: readyToImport.length });
    }

    setImporting(false);
    setProgress(null);
    setOpen(false);
    onImported();
  }

  return {
    open,
    loading,
    candidates,
    chosenSpecs,
    error,
    importing,
    progress,
    readyToImport,
    battletag,
    minLevel,
    awaitingAccountChoice,
    awaitingReauth,
    switchingAccount,
    instructionsAcknowledged,
    acknowledgeInstructions: () => setInstructionsAcknowledged(true),
    handleSync,
    toggleSpec,
    handleImport,
    confirmSameAccount,
    requestOtherAccount,
    cancelReauth,
    confirmOtherAccount,
    handleCancel,
  };
}

export type BlizzardImportState = ReturnType<typeof useBlizzardImport>;

export function BlizzardSyncButton({ loading, onClick }: { loading: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={() => onClick()}
      disabled={loading}
      className="btn btn-blizzard !flex-col !gap-0 !leading-tight w-full"
    >
      <span className="flex items-center gap-1.5">
        <RotateCw className="w-3.5 h-3.5" />
        {loading ? "Consultando..." : "Sincronizar personajes"}
      </span>
      {!loading && <span>con Blizzard</span>}
    </button>
  );
}

export function BlizzardImportResults(state: BlizzardImportState) {
  const {
    open,
    loading,
    candidates,
    chosenSpecs,
    error,
    importing,
    progress,
    readyToImport,
    battletag,
    minLevel,
    awaitingAccountChoice,
    awaitingReauth,
    switchingAccount,
    instructionsAcknowledged,
    acknowledgeInstructions,
    toggleSpec,
    handleImport,
    handleSync,
    confirmSameAccount,
    requestOtherAccount,
    cancelReauth,
    confirmOtherAccount,
    handleCancel,
  } = state;

  const confirm = useConfirm();
  const hasNewCandidates = candidates.some((c) => !c.alreadyAdded);
  const [prompting, setPrompting] = useState(false);

  useEffect(() => {
    if (!open || loading || awaitingAccountChoice || awaitingReauth) return;
    if (!hasNewCandidates || instructionsAcknowledged || prompting) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPrompting(true);
    confirm(
      "Sincronizar SOLO trae la lista de tus personajes desde Blizzard -- todavía no se importa ninguno.\n\n" +
        "Para cada personaje que quieras agregar:\n" +
        "1. Elige su especialización (o varias) en su tarjeta.\n" +
        '2. Presiona "Importar (N) personajes" al final de la lista.\n\n' +
        "Un personaje SIN ninguna especialización marcada no se importa.",
      { title: "Cómo importar tus personajes", confirmLabel: "Entendido, continuar", cancelLabel: "Cancelar" }
    ).then((ok) => {
      setPrompting(false);
      if (ok) acknowledgeInstructions();
      else handleCancel();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, loading, awaitingAccountChoice, awaitingReauth, hasNewCandidates, instructionsAcknowledged, prompting]);

  if (!open) return null;

  if (loading) {
    return (
      <div className="card p-5 mb-5">
        <div className="flex items-center gap-3 py-4 justify-center">
          <RotateCw className="w-4 h-4 animate-spin" style={{ color: "var(--color-primary)" }} />
          <p className="text-sm text-ink-muted">Consultando tu cuenta de Blizzard... puede tardar unos segundos.</p>
        </div>
      </div>
    );
  }

  if (awaitingAccountChoice) {
    return (
      <div className="card p-5 mb-5">
        {error && (
          <p className="text-sm mb-4" style={{ color: "var(--color-danger)" }}>
            {error}
          </p>
        )}
        <p className="text-sm text-ink-muted mb-1">
          Cuenta conectada: <span className="font-semibold text-ink">{battletag ?? "Battle.net"}</span>
        </p>
        <p className="text-sm text-ink-muted mb-4">¿Quieres importar más personajes de esta cuenta o de otra?</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button type="button" onClick={confirmSameAccount} className="btn btn-primary">
            Sí, esta cuenta
          </button>
          <button type="button" onClick={requestOtherAccount} className="btn btn-secondary">
            No, otra cuenta de Battle.net
          </button>
        </div>
        <button type="button" onClick={handleCancel} className="btn btn-ghost mt-3">
          Cancelar
        </button>
      </div>
    );
  }

  if (awaitingReauth) {
    return (
      <div className="card p-5 mb-5">
        <p className="text-sm text-ink-muted mb-3">
          Battle.net no deja elegir cuenta si ya hay una sesión activa en el navegador. Antes de continuar:
        </p>
        <ol className="text-sm text-ink-muted list-decimal list-inside space-y-1 mb-4">
          <li>Abre Battle.net en una pestaña nueva.</li>
          <li>Si aparece la cuenta ya conectada, cierra sesión ahí.</li>
          <li>Si en cambio aparece &quot;Cuenta&quot;, inicia sesión y ciérrala.</li>
          <li>Vuelve aquí y presiona &quot;Ya cerré sesión&quot;.</li>
        </ol>
        <div className="flex flex-wrap gap-3">
          <a href="https://battle.net" target="_blank" rel="noopener noreferrer" className="btn btn-secondary">
            Abrir Battle.net
          </a>
          <button type="button" onClick={() => confirmOtherAccount()} disabled={switchingAccount} className="btn btn-primary">
            {switchingAccount ? "Redirigiendo..." : "Ya cerré sesión"}
          </button>
          <button type="button" onClick={cancelReauth} disabled={switchingAccount} className="btn btn-ghost">
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card p-5 mb-5">
      {error && (
        <p className="text-sm mb-4" style={{ color: "var(--color-danger)" }}>
          {error}
        </p>
      )}

      {candidates.length === 0 ? (
        <div className="text-center py-4">
          <p className="text-ink-faint text-sm mb-4">
            No se encontraron personajes nivel {minLevel}+ nuevos en tu cuenta.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button type="button" onClick={() => handleSync(true)} className="btn btn-primary">
              Volver a intentar
            </button>
            <button type="button" onClick={handleCancel} className="btn btn-secondary">
              Cerrar
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-4 h-4" style={{ color: "var(--color-primary)" }} />
            <p className="text-sm text-ink-muted">Elige la especialización(es) de tu personaje para importarlo.</p>
          </div>

          {(() => {
            let cascadeIndex = 0;
            return groupCandidatesByAccount(candidates).map((group, groupIndex) => (
              <div key={group.label ?? "single"} className={groupIndex > 0 ? "mt-5" : undefined}>
                {group.label && (
                  <div className="flex items-center gap-2.5 mb-3">
                    <span
                      className="inline-flex items-center gap-1.5 shrink-0 text-xs font-bold px-2.5 py-1 rounded-full"
                      style={{
                        color: group.color ?? "var(--color-secondary)",
                        backgroundColor: `color-mix(in srgb, ${group.color ?? "var(--color-secondary)"} 20%, transparent)`,
                        border: `1px solid color-mix(in srgb, ${group.color ?? "var(--color-secondary)"} 50%, transparent)`,
                      }}
                    >
                      <KeyRound className="w-3.5 h-3.5" />
                      {group.label}
                    </span>
                    <span className="flex-1 h-px" style={{ backgroundColor: "var(--color-line-strong)" }} />
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {group.items.map((c) => {
                    const key = candidateKey(c);
                    const color = classColor(c.class);
                    const faction = factionLabel(c.faction);
                    const index = cascadeIndex++;

                    if (c.alreadyAdded) {
                      return (
                        <div
                          key={key}
                          className="rounded-xl px-3 py-2.5 opacity-60 cascade-item"
                          style={{
                            backgroundColor: "var(--color-surface-2)",
                            borderTop: "1px solid var(--color-line)",
                            borderRight: "1px solid var(--color-line)",
                            borderBottom: "1px solid var(--color-line)",
                            borderLeft: `3px solid ${color}`,
                            ...cascadeStyle(index),
                          }}
                        >
                          <p className="text-xs font-semibold text-ink truncate">
                            {c.name} <span className="text-ink-faint font-normal">{c.realmName || c.realmSlug}</span>
                          </p>
                          <p className="text-label mt-0.5 truncate" style={{ color }}>
                            {c.class ?? "Clase desconocida"}
                            {faction ? ` · ${faction}` : ""} · Nivel {c.level}
                          </p>
                          <p className="text-micro text-ink-faint mt-1">Ya agregado</p>
                        </div>
                      );
                    }

                    const selected = (chosenSpecs[key]?.length ?? 0) > 0;

                    const baseBorder = selected
                      ? "1px solid color-mix(in srgb, var(--color-secondary) 55%, transparent)"
                      : "1px solid var(--color-line)";

                    return (
                      <div
                        key={key}
                        className="rounded-xl p-3 transition-colors cascade-item"
                        style={{
                          borderTop: baseBorder,
                          borderRight: baseBorder,
                          borderBottom: baseBorder,
                          borderLeft: `3px solid ${color}`,
                          backgroundColor: selected
                            ? "color-mix(in srgb, var(--color-secondary) 16%, var(--color-surface-2))"
                            : "var(--color-surface-2)",
                          ...cascadeStyle(index),
                        }}
                      >
                        <div className="mb-2.5">
                          <p className="text-xs font-semibold text-ink truncate">
                            {c.name} <span className="text-ink-faint font-normal">{c.realmName || c.realmSlug}</span>
                          </p>
                          <p className="text-label mt-0.5 truncate" style={{ color }}>
                            {c.class ?? "Clase desconocida"}
                            {faction ? ` · ${faction}` : ""} · Nivel {c.level}
                          </p>
                        </div>
                        {c.class && (
                          <SpecOrderPicker
                            compact
                            wowClass={c.class}
                            order={chosenSpecs[key] ?? []}
                            onToggle={(spec) => toggleSpec(key, spec)}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ));
          })()}

          {progress && (
            <div className="mt-4">
              <div className="flex items-center justify-between text-xs text-ink-muted mb-2">
                <span>
                  Importando: {progress.done} / {progress.total}
                </span>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: "var(--color-surface-2)" }}>
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${progress.total > 0 ? (progress.done / progress.total) * 100 : 0}%`,
                    background: "linear-gradient(90deg, var(--color-primary), var(--color-secondary))",
                  }}
                />
              </div>
            </div>
          )}

          <div className="flex gap-3 mt-4">
            <button
              type="button"
              onClick={handleImport}
              disabled={importing || readyToImport.length === 0}
              className="btn btn-primary"
            >
              {importing ? "Importando..." : `Importar (${readyToImport.length}) personajes`}
            </button>
            <button type="button" onClick={handleCancel} disabled={importing} className="btn btn-secondary">
              Cancelar
            </button>
          </div>
        </>
      )}
    </div>
  );
}
