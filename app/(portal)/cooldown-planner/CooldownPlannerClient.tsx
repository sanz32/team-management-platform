"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PlusCircle, UploadCloud, Copy, Trash2, Library, Timer } from "lucide-react";
import BossThumb from "@/app/components/BossThumb";
import SectionToggle from "@/app/components/SectionToggle";
import IconAction from "@/app/components/IconAction";
import FloatingMenu from "@/app/components/FloatingMenu";
import { classColor, wclClassNameToDisplay } from "@/lib/wow-classes";
import { cascadeStyle } from "@/lib/cascade";
import { readJson } from "@/lib/read-json";
import { formatFightDateTime } from "@/lib/format";
import { formatTimelineClock } from "@/lib/cooldown-planner/format";
import {
  CooldownSpell,
  ReferenceLogImport,
  ReferenceLogTimeline,
  CooldownPlan,
  CooldownPlanAssignment,
} from "@/lib/cooldown-planner/types";
import CooldownTimeline, { TimelineCastMarker } from "./CooldownTimeline";
import { TimelinePersonGroup } from "@/lib/cooldown-planner/timeline-groups";
import PageHeader from "@/app/components/PageHeader";

interface Boss {
  id: string;
  name: string;
  orderIndex: number;
  imageUrl: string | null;
}

interface RosterCharacter {
  id: string;
  name: string;
  class: string | null;
  active_spec: string | null;
}

interface WclFightOption {
  id: number;
  bossName: string;
  encounterId: number;
  difficulty: number | null;
  kill: boolean | null;
  startTime: number;
  bossPercentage: number | null;
}

const DIFFICULTY_LABELS: Record<number, string> = { 4: "Heroico", 5: "Mítico" };
function difficultyLabel(difficulty: number | null): string {
  if (difficulty === null) return "-";
  return DIFFICULTY_LABELS[difficulty] ?? `Dificultad ${difficulty}`;
}

async function getJson<T>(url: string): Promise<T | null> {
  const res = await fetch(url);
  return readJson<T>(res);
}

export default function CooldownPlannerClient({ canManage }: { canManage: boolean }) {
  const [bosses, setBosses] = useState<Boss[]>([]);
  const [selectedBossId, setSelectedBossId] = useState<string | null>(null);
  const [loadingBosses, setLoadingBosses] = useState(true);

  const [referenceLogs, setReferenceLogs] = useState<ReferenceLogImport[]>([]);
  const [plans, setPlans] = useState<CooldownPlan[]>([]);
  const [spellLibrary, setSpellLibrary] = useState<CooldownSpell[]>([]);
  const [characters, setCharacters] = useState<RosterCharacter[]>([]);

  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
  const [referenceTimeline, setReferenceTimeline] = useState<ReferenceLogTimeline | null>(null);

  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [planAssignments, setPlanAssignments] = useState<CooldownPlanAssignment[]>([]);

  const [importOpen, setImportOpen] = useState(false);
  const [importUrl, setImportUrl] = useState("");
  const [importFights, setImportFights] = useState<WclFightOption[] | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [createPlanOpen, setCreatePlanOpen] = useState(false);
  const [newPlanName, setNewPlanName] = useState("");

  const [assigningCastId, setAssigningCastId] = useState<string | null>(null);
  const [assigningCastAnchor, setAssigningCastAnchor] = useState<HTMLElement | null>(null);
  const [assigningPersonKey, setAssigningPersonKey] = useState<string | null>(null);
  const [assigningPersonAnchor, setAssigningPersonAnchor] = useState<HTMLElement | null>(null);

  const spellById = useMemo(() => new Map(spellLibrary.map((s) => [s.spellId, s])), [spellLibrary]);
  const characterById = useMemo(() => new Map(characters.map((c) => [c.id, c])), [characters]);

  useEffect(() => {
    getJson<{ season: { bosses: Boss[] } | null }>("/api/wishlist/season").then((data) => {
      setBosses(data?.season?.bosses ?? []);
      setLoadingBosses(false);
    });
    getJson<{ spells: CooldownSpell[] }>("/api/cooldown-planner/spell-library?categorized=true").then((data) => {
      setSpellLibrary(data?.spells ?? []);
    });
    if (canManage) {
      getJson<{ characters: RosterCharacter[] }>("/api/characters?all=true").then((data) => {
        setCharacters(data?.characters ?? []);
      });
    }
  }, [canManage]);

  const loadBossData = useCallback((bossId: string) => {
    getJson<{ logs: ReferenceLogImport[] }>(`/api/cooldown-planner/reference-logs?bossId=${bossId}`).then((data) =>
      setReferenceLogs(data?.logs ?? [])
    );
    getJson<{ plans: CooldownPlan[] }>(`/api/cooldown-planner/plans?bossId=${bossId}`).then((data) =>
      setPlans(data?.plans ?? [])
    );
  }, []);

  function selectBoss(bossId: string) {
    setSelectedBossId(bossId);
    setSelectedLogId(null);
    setReferenceTimeline(null);
    setSelectedPlanId(null);
    setPlanAssignments([]);
    setImportFights(null);
    loadBossData(bossId);
  }

  function selectReferenceLog(logId: string) {
    setSelectedLogId(logId);
    getJson<ReferenceLogTimeline>(`/api/cooldown-planner/reference-logs/${logId}`).then(setReferenceTimeline);
  }

  const loadPlanAssignments = useCallback((planId: string) => {
    getJson<{ plan: CooldownPlan; assignments: CooldownPlanAssignment[] }>(`/api/cooldown-planner/plans/${planId}`).then(
      (data) => setPlanAssignments(data?.assignments ?? [])
    );
  }, []);

  function selectPlan(planId: string) {
    setSelectedPlanId(planId);
    loadPlanAssignments(planId);
  }

  async function handleFetchFights() {
    setError(null);
    setImportBusy(true);
    try {
      const res = await fetch("/api/admin/cooldown-planner/reference-fights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: importUrl }),
      });
      const data = await readJson<{ report?: { fights: WclFightOption[] }; error?: string }>(res);
      if (!res.ok || !data?.report) {
        setError(data?.error ?? "No se pudo consultar ese reporte.");
        return;
      }
      setImportFights(data.report.fights);
    } finally {
      setImportBusy(false);
    }
  }

  async function handleImportFight(fightId: number) {
    if (!selectedBossId) return;
    setError(null);
    setImportBusy(true);
    try {
      const res = await fetch("/api/admin/cooldown-planner/import-reference", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: importUrl, fightId }),
      });
      const data = await readJson<ReferenceLogTimeline & { error?: string }>(res);
      if (!res.ok || !data) {
        setError((data as { error?: string } | null)?.error ?? "No se pudo importar ese pull.");
        return;
      }
      setImportFights(null);
      setImportUrl("");
      setImportOpen(false);
      loadBossData(selectedBossId);
      setSelectedLogId(data.log.id);
      setReferenceTimeline(data);
    } finally {
      setImportBusy(false);
    }
  }

  async function handleCreatePlan() {
    if (!selectedBossId || !newPlanName.trim()) return;
    const res = await fetch("/api/cooldown-planner/plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bossId: selectedBossId,
        name: newPlanName.trim(),
        basedOnReferenceLogId: selectedLogId,
      }),
    });
    const data = await readJson<{ plan: CooldownPlan; error?: string }>(res);
    if (!res.ok || !data?.plan) {
      setError(data?.error ?? "No se pudo crear el plan.");
      return;
    }
    setNewPlanName("");
    setCreatePlanOpen(false);
    loadBossData(selectedBossId);
    setSelectedPlanId(data.plan.id);
    setPlanAssignments([]);
  }

  async function handleDeletePlan(planId: string) {
    if (!selectedBossId) return;
    await fetch(`/api/cooldown-planner/plans/${planId}`, { method: "DELETE" });
    if (selectedPlanId === planId) setSelectedPlanId(null);
    loadBossData(selectedBossId);
  }

  async function handleDeleteReferenceLog(logId: string) {
    if (!selectedBossId) return;
    await fetch(`/api/cooldown-planner/reference-logs/${logId}`, { method: "DELETE" });
    if (selectedLogId === logId) {
      setSelectedLogId(null);
      setReferenceTimeline(null);
    }
    loadBossData(selectedBossId);
  }

  async function handleUseTiming(castId: string, spellId: number, timestampMs: number, characterId: string) {
    if (!selectedPlanId) return;
    setAssigningCastId(null);
    const res = await fetch(`/api/cooldown-planner/plans/${selectedPlanId}/assignments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        spellId,
        plannedTimestampMs: timestampMs,
        assignedCharacterId: characterId,
        referenceCastId: castId,
      }),
    });
    if (res.ok) loadPlanAssignments(selectedPlanId);
  }

  async function handleUseAllTimingsForPerson(person: TimelinePersonGroup<TimelineCastMarker>, characterId: string) {
    if (!selectedPlanId) return;
    setAssigningPersonKey(null);
    const allCasts = person.rows.flatMap((row) => row.casts);
    await Promise.all(
      allCasts.map((cast) =>
        fetch(`/api/cooldown-planner/plans/${selectedPlanId}/assignments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            spellId: cast.spellId,
            plannedTimestampMs: cast.timestampMs,
            assignedCharacterId: characterId,
            referenceCastId: cast.id,
          }),
        })
      )
    );
    loadPlanAssignments(selectedPlanId);
  }

  async function handleRemoveAssignment(assignmentId: string) {
    if (!selectedPlanId) return;
    await fetch(`/api/cooldown-planner/assignments/${assignmentId}`, { method: "DELETE" });
    loadPlanAssignments(selectedPlanId);
  }

  async function handleCopyNote() {
    if (!selectedPlanId) return;
    const data = await getJson<{ note: string }>(`/api/cooldown-planner/plans/${selectedPlanId}/nsrt-note`);
    if (data?.note) {
      await navigator.clipboard.writeText(data.note);
      setError(null);
    }
  }

  async function handleCopyAllNotes() {
    const latestPlanIds: string[] = [];
    for (const boss of bosses) {
      const data = await getJson<{ plans: CooldownPlan[] }>(`/api/cooldown-planner/plans?bossId=${boss.id}`);
      const latest = data?.plans?.[0];
      if (latest) latestPlanIds.push(latest.id);
    }
    if (latestPlanIds.length === 0) return;
    const data = await getJson<{ note: string }>(`/api/cooldown-planner/nsrt-note?planIds=${latestPlanIds.join(",")}`);
    if (data?.note) await navigator.clipboard.writeText(data.note);
  }

  const selectedBoss = bosses.find((b) => b.id === selectedBossId) ?? null;

  const referenceCastMarkers: TimelineCastMarker[] = (referenceTimeline?.casts ?? []).map((cast) => {
    const spell = spellById.get(cast.spellId);
    const casterClass = wclClassNameToDisplay(cast.casterClass ?? "");
    return {
      id: cast.id,
      spellId: cast.spellId,
      spellName: spell?.name ?? `Spell ${cast.spellId}`,
      iconUrl: spell?.iconUrl ?? null,
      durationSeconds: spell?.durationSeconds ?? null,
      timestampMs: cast.timestampMs,
      personRoleLabel: cast.casterSpec ? `${cast.casterSpec} ${casterClass}`.trim() : casterClass || "Sin clase",
      casterClass: casterClass || null,
      laneColor: classColor(casterClass),
      category: spell?.category ?? null,
      personLabel: cast.casterName,
      action: canManage && selectedPlanId ? (
        <>
          <button
            type="button"
            onClick={(e) => {
              setAssigningCastAnchor(e.currentTarget);
              setAssigningCastId(assigningCastId === cast.id ? null : cast.id);
            }}
            className="text-micro px-1.5 py-0.5 rounded bg-[color:var(--color-primary)] text-white opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap"
          >
            Usar este timing
          </button>
          <FloatingMenu
            open={assigningCastId === cast.id}
            anchorEl={assigningCastAnchor}
            onClose={() => setAssigningCastId(null)}
          >
            {characters
              .filter((c) => wclClassNameToDisplay(cast.casterClass ?? "") === c.class)
              .map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => handleUseTiming(cast.id, cast.spellId, cast.timestampMs, c.id)}
                  className="w-full text-left px-2 py-1.5 rounded-md text-sm truncate hover:bg-[color:var(--color-surface-2)]"
                  style={{ color: classColor(c.class) }}
                >
                  {c.name} <span className="text-ink-faint">({c.active_spec ?? "?"})</span>
                </button>
              ))}
          </FloatingMenu>
        </>
      ) : undefined,
    };
  });

  const planCastMarkers: TimelineCastMarker[] = planAssignments.map((a) => {
    const spell = spellById.get(a.spellId);
    const character = a.assignedCharacterId ? characterById.get(a.assignedCharacterId) : null;
    return {
      id: a.id,
      spellId: a.spellId,
      spellName: spell?.name ?? `Spell ${a.spellId}`,
      iconUrl: spell?.iconUrl ?? null,
      durationSeconds: spell?.durationSeconds ?? null,
      timestampMs: a.plannedTimestampMs,
      personRoleLabel: character
        ? `${character.active_spec ?? ""} ${character.class ?? ""}`.trim() || "Sin clase"
        : "Sin asignar",
      casterClass: character?.class ?? null,
      laneColor: classColor(character?.class ?? null),
      category: spell?.category ?? null,
      personLabel: character?.name ?? "Sin asignar",
      action: canManage ? (
        <IconAction
          icon={Trash2}
          label="Quitar del plan"
          onClick={() => handleRemoveAssignment(a.id)}
          className="hover:text-[color:var(--color-danger)] opacity-0 group-hover:opacity-100"
        />
      ) : undefined,
    };
  });

  const referenceDuration = referenceTimeline?.log.pullDurationMs ?? 0;
  const planDuration = referenceDuration || Math.max(0, ...planAssignments.map((a) => a.plannedTimestampMs), 60000);

  function renderPersonAction(person: TimelinePersonGroup<TimelineCastMarker>) {
    if (!canManage || !selectedPlanId) return null;
    const groupClass = person.rows[0]?.casts[0]?.casterClass ?? null;
    const matchingCharacters = characters.filter((c) => c.class === groupClass);
    const isOpen = assigningPersonKey === person.personLabel;
    return (
      <div className="shrink-0">
        <button
          type="button"
          onClick={(e) => {
            setAssigningPersonAnchor(e.currentTarget);
            setAssigningPersonKey(isOpen ? null : person.personLabel);
          }}
          className="text-micro px-1.5 py-0.5 rounded border border-[color:var(--color-line-strong)] text-ink-muted hover:text-ink whitespace-nowrap"
        >
          Usar todo
        </button>
        <FloatingMenu
          open={isOpen}
          anchorEl={assigningPersonAnchor}
          align="end"
          onClose={() => setAssigningPersonKey(null)}
        >
          {matchingCharacters.length === 0 ? (
            <p className="text-xs text-ink-faint px-2 py-1">Sin personajes de esta clase en el roster.</p>
          ) : (
            matchingCharacters.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => handleUseAllTimingsForPerson(person, c.id)}
                className="w-full text-left px-2 py-1.5 rounded-md text-sm hover:bg-[color:var(--color-surface-2)]"
                style={{ color: classColor(c.class) }}
              >
                {c.name} <span className="text-ink-faint">({c.active_spec ?? "?"})</span>
              </button>
            ))
          )}
        </FloatingMenu>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow="Raid"
        icon={Timer}
        title="Cooldown Planner"
        description="Importa un log de referencia de Warcraft Logs, arma tu plan de cooldowns y expórtalo a NSRT."
        actions={
          canManage && (
            <Link href="/cooldown-planner/admin" className="btn btn-ghost shrink-0">
              <Library className="w-4 h-4" /> Librería de cooldowns
            </Link>
          )
        }
      />

      {error && (
        <div className="card p-3 mb-4 text-sm" style={{ borderColor: "var(--color-danger)", color: "var(--color-danger)" }}>
          {error}
        </div>
      )}

      {loadingBosses ? (
        <p className="text-ink-faint text-sm">Cargando raids...</p>
      ) : bosses.length === 0 ? (
        <p className="text-ink-faint text-sm">
          No hay una temporada sincronizada todavía (
          <Link href="/configuracion" className="underline">
            Configuración &gt; Temporada
          </Link>
          ).
        </p>
      ) : (
        <div className="flex flex-wrap gap-2 mb-6">
          {bosses.map((boss, i) => (
            <button
              key={boss.id}
              type="button"
              onClick={() => selectBoss(boss.id)}
              className="card card-hover cascade-item flex items-center gap-2 px-3 py-2"
              style={{
                ...cascadeStyle(i),
                borderColor: selectedBossId === boss.id ? "var(--color-primary)" : undefined,
              }}
            >
              <BossThumb imageUrl={boss.imageUrl} width={40} height={20} />
              <span className="text-sm font-semibold text-ink">{boss.name}</span>
            </button>
          ))}
        </div>
      )}

      {selectedBoss && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="card p-4">
              {canManage && (
                <div className="mb-4">
                  <SectionToggle
                    icon={UploadCloud}
                    title="Importar log de referencia"
                    hint="Cualquier reporte público de Warcraft Logs"
                    open={importOpen}
                    onToggle={() => setImportOpen((v) => !v)}
                  />
                  {importOpen && (
                    <div className="mt-3 space-y-2">
                      <input
                        className="input w-full"
                        placeholder="https://www.warcraftlogs.com/reports/..."
                        value={importUrl}
                        onChange={(e) => setImportUrl(e.target.value)}
                      />
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={!importUrl || importBusy}
                        onClick={handleFetchFights}
                      >
                        Buscar pulls
                      </button>
                      {importFights && (
                        <div className="max-h-48 overflow-y-auto space-y-1">
                          {importFights.map((f) => (
                            <button
                              key={f.id}
                              type="button"
                              disabled={importBusy}
                              onClick={() => handleImportFight(f.id)}
                              className="w-full flex items-center gap-2 text-left px-3 py-2 rounded-md text-sm hover:bg-[color:var(--color-surface-2)]"
                            >
                              <span className="truncate flex-1">{f.bossName}</span>
                              <span className="text-xs text-ink-faint shrink-0">{difficultyLabel(f.difficulty)}</span>
                              <span className="text-xs text-ink-faint shrink-0 font-data">
                                {formatFightDateTime(f.startTime)}
                              </span>
                              <span className={`pill shrink-0 ${f.kill ? "pill-success" : "pill-common"}`}>
                                {f.kill ? "Kill" : `Wipe${f.bossPercentage != null ? ` ${f.bossPercentage}%` : ""}`}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
              <h3 className="font-heading font-semibold text-ink mb-2">Logs de referencia</h3>
              {referenceLogs.length === 0 ? (
                <p className="text-sm text-ink-faint">Todavía no se importó ninguno para este jefe.</p>
              ) : (
                <div className="space-y-1">
                  {referenceLogs.map((log) => (
                    <div key={log.id} className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => selectReferenceLog(log.id)}
                        className="flex-1 text-left px-3 py-2 rounded-md text-sm hover:bg-[color:var(--color-surface-2)]"
                        style={{ backgroundColor: selectedLogId === log.id ? "var(--color-surface-2)" : undefined }}
                      >
                        {log.sourceGuildName ?? "Log público"} · {log.difficulty ?? "?"} ·{" "}
                        {formatTimelineClock(log.pullDurationMs ?? 0)}
                      </button>
                      {canManage && (
                        <IconAction
                          icon={Trash2}
                          label="Eliminar log de referencia"
                          onClick={() => handleDeleteReferenceLog(log.id)}
                          className="hover:text-[color:var(--color-danger)]"
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="card p-4">
              {canManage && (
                <div className="mb-4">
                  <SectionToggle
                    icon={PlusCircle}
                    title="Crear nuevo plan"
                    hint={selectedLogId ? "Basado en el log de referencia elegido" : "Plan en blanco"}
                    open={createPlanOpen}
                    onToggle={() => setCreatePlanOpen((v) => !v)}
                  />
                  {createPlanOpen && (
                    <div className="mt-3 flex gap-2">
                      <input
                        className="input flex-1"
                        placeholder="Nombre del plan"
                        value={newPlanName}
                        onChange={(e) => setNewPlanName(e.target.value)}
                      />
                      <button type="button" className="btn btn-primary" disabled={!newPlanName.trim()} onClick={handleCreatePlan}>
                        Crear
                      </button>
                    </div>
                  )}
                </div>
              )}
              <h3 className="font-heading font-semibold text-ink mb-2">Planes</h3>
              {plans.length === 0 ? (
                <p className="text-sm text-ink-faint">Todavía no hay ningún plan para este jefe.</p>
              ) : (
                <div className="space-y-1">
                  {plans.map((plan) => (
                    <div key={plan.id} className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => selectPlan(plan.id)}
                        className="flex-1 text-left px-3 py-2 rounded-md text-sm hover:bg-[color:var(--color-surface-2)]"
                        style={{ backgroundColor: selectedPlanId === plan.id ? "var(--color-surface-2)" : undefined }}
                      >
                        {plan.name}
                      </button>
                      {canManage && (
                        <IconAction
                          icon={Trash2}
                          label="Eliminar plan"
                          onClick={() => handleDeletePlan(plan.id)}
                          className="hover:text-[color:var(--color-danger)]"
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}
              {selectedPlanId && (
                <div className="mt-3 flex gap-2">
                  <button type="button" className="btn btn-secondary" onClick={handleCopyNote}>
                    <Copy className="w-4 h-4" /> Copiar nota
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={handleCopyAllNotes}>
                    Copiar todas las notas
                  </button>
                </div>
              )}
            </div>
          </div>

          {referenceTimeline && (
            <CooldownTimeline
              title={`Referencia: ${referenceTimeline.log.sourceGuildName ?? "log público"}`}
              durationMs={referenceDuration}
              bossEvents={referenceTimeline.bossEvents.map((e) => ({
                id: e.id,
                spellName: e.spellName,
                timestampMs: e.timestampMs,
                iconUrl: e.iconUrl,
              }))}
              casts={referenceCastMarkers}
              emptyLabel="Este log no tiene casts de cooldown que coincidan con la librería."
              phaseTransitions={referenceTimeline.log.phaseTransitions}
              renderPersonAction={renderPersonAction}
            />
          )}

          {selectedPlanId && (
            <CooldownTimeline
              title="Mi plan"
              durationMs={planDuration}
              bossEvents={
                referenceTimeline?.bossEvents.map((e) => ({
                  id: e.id,
                  spellName: e.spellName,
                  timestampMs: e.timestampMs,
                  iconUrl: e.iconUrl,
                })) ?? []
              }
              casts={planCastMarkers}
              emptyLabel="Todavía no hay ningún cooldown asignado a este plan."
              phaseTransitions={referenceTimeline?.log.phaseTransitions ?? []}
            />
          )}
        </div>
      )}
    </div>
  );
}
