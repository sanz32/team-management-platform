"use client";

import { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import SectionToggle from "@/app/components/SectionToggle";
import BossThumb from "@/app/components/BossThumb";
import { formatFightDateTime } from "@/lib/format";
import type { Difficulty } from "@/lib/raids";
import { readJsonBody } from "@/lib/read-json";
import { useToast } from "@/app/components/ToastProvider";

interface JournalInstance {
  id: number;
  name: string;
}

interface SeasonBoss {
  id: string;
  name: string;
  imageUrl: string | null;
}

interface CurrentSeason {
  id: string;
  name: string;
  syncedAt: string | null;
  bosses: SeasonBoss[];
}

const COLOR_PRESETS: { color: string; colorClass: string; label: string }[] = [
  { color: "#4ade80", colorClass: "text-green-400", label: "Verde" },
  { color: "#f472b6", colorClass: "text-pink-400", label: "Rosa" },
  { color: "#c084fc", colorClass: "text-purple-400", label: "Púrpura" },
  { color: "#facc15", colorClass: "text-yellow-400", label: "Amarillo" },
  { color: "#60a5fa", colorClass: "text-blue-400", label: "Azul" },
  { color: "#f87171", colorClass: "text-red-400", label: "Rojo" },
  { color: "#fb923c", colorClass: "text-orange-400", label: "Naranja" },
  { color: "#22d3ee", colorClass: "text-cyan-400", label: "Cian" },
  { color: "#2dd4bf", colorClass: "text-teal-400", label: "Verde azulado" },
  { color: "#818cf8", colorClass: "text-indigo-400", label: "Índigo" },
];

const DIFFICULTY_OPTIONS: { key: Difficulty; label: string }[] = [
  { key: "world", label: "Mundo" },
  { key: "normal", label: "Normal" },
  { key: "heroic", label: "Heroico" },
  { key: "mythic", label: "Mítico" },
];

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/(^_|_$)/g, "");
}

interface RaidConfigDraft {
  instanceId: number;
  instanceName: string;
  raidKey: string;
  abbr: string;
  colorIndex: number;
  blizzardInstanceName: string;
  difficulties: Set<Difficulty>;
  lockoutSource: "blizzard" | "wcl";
  forceWclManualRefresh: boolean;
  headerImageUrl: string;
}

function draftFromInstance(instance: JournalInstance): RaidConfigDraft {
  return {
    instanceId: instance.id,
    instanceName: instance.name,
    raidKey: slugify(instance.name),
    abbr: "",
    colorIndex: 0,
    blizzardInstanceName: instance.name,
    difficulties: new Set(["heroic", "mythic"]),
    lockoutSource: "blizzard",
    forceWclManualRefresh: false,
    headerImageUrl: "",
  };
}

export default function SyncSeasonPanel({ onSynced }: { onSynced?: () => void }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [instances, setInstances] = useState<JournalInstance[]>([]);
  const [search, setSearch] = useState("");
  const [drafts, setDrafts] = useState<RaidConfigDraft[]>([]);
  const [seasonName, setSeasonName] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [savedImageIds, setSavedImageIds] = useState<Set<string>>(new Set());

  const [currentSeason, setCurrentSeason] = useState<CurrentSeason | null>(null);
  const [loadingCurrent, setLoadingCurrent] = useState(true);

  async function loadCurrentSeason() {
    try {
      const res = await fetch("/api/wishlist/season");
      if (res.ok) {
        const data = await readJsonBody(res);
        setCurrentSeason(data.season ?? null);
      }
    } finally {
      setLoadingCurrent(false);
    }
  }

  useEffect(() => {
    loadCurrentSeason();
  }, []);

  useEffect(() => {
    if (!open || instances.length > 0) return;
    fetch("/api/admin/wishlist/instances")
      .then((r) => r.json())
      .then((d) => setInstances(d.instances ?? []));
  }, [open, instances.length]);

  const filtered = useMemo(
    () =>
      search.trim().length < 2
        ? []
        : instances
            .filter((i) => i.name.toLowerCase().includes(search.toLowerCase()))
            .filter((i) => !drafts.some((d) => d.instanceId === i.id))
            .slice(0, 15),
    [instances, search, drafts]
  );

  function addInstance(instance: JournalInstance) {
    setDrafts((prev) => [...prev, draftFromInstance(instance)]);
    setSearch("");
  }

  function removeInstance(instanceId: number) {
    setDrafts((prev) => prev.filter((d) => d.instanceId !== instanceId));
  }

  function updateDraft(instanceId: number, patch: Partial<RaidConfigDraft>) {
    setDrafts((prev) => prev.map((d) => (d.instanceId === instanceId ? { ...d, ...patch } : d)));
  }

  function toggleDifficulty(instanceId: number, difficulty: Difficulty) {
    setDrafts((prev) =>
      prev.map((d) => {
        if (d.instanceId !== instanceId) return d;
        const next = new Set(d.difficulties);
        if (next.has(difficulty)) {
          if (next.size === 1) return d;
          next.delete(difficulty);
        } else {
          next.add(difficulty);
        }
        return { ...d, difficulties: next };
      })
    );
  }

  const formError = useMemo(() => {
    if (!seasonName.trim()) return null;
    if (drafts.length === 0) return null;
    for (const d of drafts) {
      if (!d.raidKey.trim()) return `${d.instanceName}: falta la clave de la raid.`;
      if (!d.abbr.trim()) return `${d.instanceName}: falta la sigla.`;
    }
    const keys = drafts.map((d) => d.raidKey.trim());
    if (new Set(keys).size !== keys.length) return "Las claves de raid no pueden repetirse.";
    return null;
  }, [drafts, seasonName]);

  async function handleSync() {
    if (!seasonName.trim() || drafts.length === 0 || formError) return;
    setSyncing(true);
    setError(null);
    setWarnings([]);
    try {
      const raidConfigs = drafts.map((d) => ({
        instanceId: d.instanceId,
        raidKey: d.raidKey.trim(),
        abbr: d.abbr.trim(),
        color: COLOR_PRESETS[d.colorIndex].color,
        colorClass: COLOR_PRESETS[d.colorIndex].colorClass,
        blizzardInstanceName: d.blizzardInstanceName.trim(),
        difficulties: Array.from(d.difficulties),
        lockoutSource: d.lockoutSource,
        forceWclManualRefresh: d.forceWclManualRefresh,
        headerImageUrl: d.headerImageUrl.trim() || null,
      }));

      const res = await fetch("/api/admin/wishlist/sync-season", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seasonName: seasonName.trim(), raidConfigs }),
      });
      const data = await readJsonBody(res);
      if (!res.ok) {
        setError(data.error ?? "No se pudo sincronizar la temporada.");
        toast.error("No se pudo sincronizar la temporada", data.error || undefined);
        return;
      }
      toast.success("Temporada sincronizada", data.season?.name);
      setCurrentSeason({
        id: data.season.id,
        name: data.season.name,
        syncedAt: new Date().toISOString(),
        bosses: data.bosses,
      });
      setWarnings(data.warnings ?? []);
      setSavedImageIds(new Set());
      setDrafts([]);
      setSeasonName("");
      if ((data.warnings ?? []).length === 0) setOpen(false);
      onSynced?.();
    } catch {
      setError("No se pudo sincronizar la temporada.");
    } finally {
      setSyncing(false);
    }
  }

  async function setBossImage(bossId: string, url: string) {
    const res = await fetch(`/api/admin/wishlist/bosses/${bossId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageUrl: url }),
    });
    if (res.ok) {
      setSavedImageIds((prev) => new Set(prev).add(bossId));
      setCurrentSeason((prev) =>
        prev ? { ...prev, bosses: prev.bosses.map((b) => (b.id === bossId ? { ...b, imageUrl: url } : b)) } : prev
      );
    }
  }

  const missingImageBosses = currentSeason?.bosses.filter((b) => !b.imageUrl) ?? [];

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <p className="text-caption mb-3">Temporada actual</p>
        {loadingCurrent ? (
          <p className="text-sm text-ink-faint">Cargando...</p>
        ) : !currentSeason ? (
          <p className="text-sm text-ink-muted">Todavía no hay ninguna temporada sincronizada.</p>
        ) : (
          <div className="space-y-3">
            <div>
              <p className="text-lg font-semibold text-ink">{currentSeason.name}</p>
              <p className="text-xs text-ink-faint">
                {currentSeason.syncedAt ? `Sincronizada el ${formatFightDateTime(new Date(currentSeason.syncedAt).getTime())} -- ` : ""}
                {currentSeason.bosses.length} jefe{currentSeason.bosses.length === 1 ? "" : "s"}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {currentSeason.bosses.map((b) => (
                <div
                  key={b.id}
                  className="flex items-center gap-2 rounded-lg px-2 py-1.5"
                  style={{ backgroundColor: "var(--color-surface-2)" }}
                >
                  <BossThumb imageUrl={b.imageUrl} width={32} height={16} />
                  <span className="text-xs text-ink">{b.name}</span>
                </div>
              ))}
            </div>
            {missingImageBosses.length > 0 && (
              <div className="pt-1 space-y-1.5">
                <p className="text-xs text-ink-faint">Sin imagen todavía:</p>
                {missingImageBosses.map((b) => (
                  <div key={b.id} className="flex items-center gap-2">
                    <span className="text-xs text-ink-faint">{b.name}:</span>
                    {savedImageIds.has(b.id) ? (
                      <span className="text-xs" style={{ color: "var(--color-success)" }}>Guardada</span>
                    ) : (
                      <input
                        type="text"
                        placeholder="URL de imagen"
                        className="input text-xs py-1"
                        onBlur={(e) => e.target.value && setBossImage(b.id, e.target.value)}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="card p-5">
        <SectionToggle
          icon={RefreshCw}
          title="Sincronizar temporada"
          hint="Elige las raids actuales del Journal de Blizzard -- no requiere deploy"
          open={open}
          onToggle={() => setOpen(!open)}
        />
        {open && (
          <div className="mt-4 space-y-4">
            <input
              type="text"
              value={seasonName}
              onChange={(e) => setSeasonName(e.target.value)}
              placeholder="Nombre de la temporada (ej. Midnight T1)"
              className="input w-full"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Busca una raid por nombre y agrégala..."
              className="input w-full"
            />
            {filtered.length > 0 && (
              <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--color-surface-2)" }}>
                {filtered.map((i) => (
                  <button
                    key={i.id}
                    onClick={() => addInstance(i)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-[color:var(--color-surface-2)]"
                  >
                    {i.name}
                  </button>
                ))}
              </div>
            )}

            {drafts.map((draft) => (
              <RaidConfigCard
                key={draft.instanceId}
                draft={draft}
                onChange={(patch) => updateDraft(draft.instanceId, patch)}
                onToggleDifficulty={(d) => toggleDifficulty(draft.instanceId, d)}
                onRemove={() => removeInstance(draft.instanceId)}
              />
            ))}

            <button
              onClick={handleSync}
              disabled={syncing || !seasonName.trim() || drafts.length === 0 || !!formError}
              className="btn btn-primary"
            >
              {syncing ? "Sincronizando..." : "Sincronizar"}
            </button>
            {formError && <p className="text-sm text-ink-faint">{formError}</p>}
            {error && <p className="text-sm" style={{ color: "var(--color-danger)" }}>{error}</p>}
            {warnings.length > 0 && (
              <div className="space-y-1">
                {warnings.map((w) => (
                  <p key={w} className="text-sm" style={{ color: "var(--color-warning)" }}>
                    ⚠ {w}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function RaidConfigCard({
  draft,
  onChange,
  onToggleDifficulty,
  onRemove,
}: {
  draft: RaidConfigDraft;
  onChange: (patch: Partial<RaidConfigDraft>) => void;
  onToggleDifficulty: (difficulty: Difficulty) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-lg p-3.5 space-y-3" style={{ border: "1px solid var(--color-line)" }}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-ink">{draft.instanceName}</span>
        <button onClick={onRemove} className="text-xs text-ink-faint hover:text-ink">
          Quitar
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <label className="flex flex-col gap-1">
          <span className="text-micro uppercase tracking-wide text-ink-faint font-data">Clave interna</span>
          <input
            type="text"
            value={draft.raidKey}
            onChange={(e) => onChange({ raidKey: e.target.value })}
            className="input text-sm py-1.5"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-micro uppercase tracking-wide text-ink-faint font-data">Sigla (ej. DR)</span>
          <input
            type="text"
            value={draft.abbr}
            onChange={(e) => onChange({ abbr: e.target.value.toUpperCase() })}
            maxLength={4}
            className="input text-sm py-1.5"
          />
        </label>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-micro uppercase tracking-wide text-ink-faint font-data">
          Nombre exacto de Blizzard (para detectar lockouts)
        </span>
        <input
          type="text"
          value={draft.blizzardInstanceName}
          onChange={(e) => onChange({ blizzardInstanceName: e.target.value })}
          className="input text-sm py-1.5"
        />
      </label>

      <div>
        <span className="text-micro uppercase tracking-wide text-ink-faint font-data">Color</span>
        <div className="flex flex-wrap gap-1.5 mt-1">
          {COLOR_PRESETS.map((preset, index) => (
            <button
              key={preset.colorClass}
              type="button"
              title={preset.label}
              onClick={() => onChange({ colorIndex: index })}
              className="w-6 h-6 rounded-full shrink-0"
              style={{
                backgroundColor: preset.color,
                boxShadow:
                  draft.colorIndex === index ? `0 0 0 2px var(--color-surface), 0 0 0 4px ${preset.color}` : undefined,
              }}
            />
          ))}
        </div>
      </div>

      <div>
        <span className="text-micro uppercase tracking-wide text-ink-faint font-data">Dificultades</span>
        <div className="flex flex-wrap gap-1.5 mt-1">
          {DIFFICULTY_OPTIONS.map((opt) => {
            const active = draft.difficulties.has(opt.key);
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => onToggleDifficulty(opt.key)}
                className="px-2 py-1 rounded-lg text-xs font-semibold transition-colors"
                style={
                  active
                    ? { backgroundColor: "var(--color-primary)", color: "var(--color-canvas)" }
                    : { border: "1px solid var(--color-line)", color: "var(--color-ink-muted)" }
                }
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-xs text-ink-muted">
          <span>Lockout vía</span>
          <select
            value={draft.lockoutSource}
            onChange={(e) => onChange({ lockoutSource: e.target.value as "blizzard" | "wcl" })}
            className="input text-xs py-1"
          >
            <option value="blizzard">Blizzard</option>
            <option value="wcl">Warcraft Logs</option>
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-xs text-ink-muted">
          <input
            type="checkbox"
            checked={draft.forceWclManualRefresh}
            onChange={(e) => onChange({ forceWclManualRefresh: e.target.checked })}
          />
          Forzar WCL en refresh manual
        </label>
      </div>
      <p className="text-label text-ink-faint">
        Marca esto si Blizzard no refleja bien el lockout de esta raid (mismo bug que tuvo Sporefall en
        Season 1: comparte el timestamp de kill entre dificultades). Si recién en las primeras semanas
        se nota el problema, se corrige a mano en la base sin resincronizar toda la temporada -- no hace
        falta acertarlo hoy.
      </p>
    </div>
  );
}
