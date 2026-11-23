"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { CheckCircle2, ChevronDown, Gem } from "lucide-react";
import DifficultyTabs from "@/app/components/DifficultyTabs";
import BossThumb from "@/app/components/BossThumb";
import { classColor } from "@/lib/wow-classes";
import { qualityColor } from "@/lib/item-quality";
import {
  upgradeBadgeTier,
  metricLabel,
  isRealUpgrade,
  WishlistDifficulty,
  UPGRADE_TIERS,
  UPGRADE_TIER_COLORS,
  UpgradeTier,
} from "@/lib/wishlist";
import { cascadeStyle } from "@/lib/cascade";
import SplitsBoard from "./SplitsBoard";
import SimsAdminPanel from "./SimsAdminPanel";
import PageHeader from "@/app/components/PageHeader";
import { useToast } from "@/app/components/ToastProvider";
import { readJsonBody } from "@/lib/read-json";

interface OwnCharacter {
  id: string;
  name: string;
  class: string | null;
  role: string | null;
  activeSpec: string | null;
  ilvl: number | null;
  realmName: string | null;
  realmSlug: string;
  hasSims: boolean;
}

function characterRealm(c: OwnCharacter): string {
  return c.realmName ? c.realmName.replace(/\s+/g, "") : c.realmSlug;
}

function characterDisplayName(c: OwnCharacter): string {
  return `${c.name}-${characterRealm(c)}`;
}

function CharacterSelect({
  characters,
  selectedId,
  onSelect,
}: {
  characters: OwnCharacter[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const selected = characters.find((c) => c.id === selectedId) ?? null;

  return (
    <div className="relative inline-block min-w-[200px]" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={selected ? characterDisplayName(selected) : "Elige un personaje"}
        className="input px-3 py-2 w-full flex items-center gap-3 text-left"
      >
        {selected && (
          <span className="leading-tight flex-1 min-w-0">
            <span className="block text-sm font-semibold truncate" style={{ color: classColor(selected.class) }}>
              {selected.name}
              {selected.hasSims ? " ✓" : ""}
            </span>
            <span className="block text-xs text-ink-faint truncate">{characterRealm(selected)}</span>
          </span>
        )}
        <ChevronDown className={`w-4 h-4 shrink-0 text-ink-faint transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div role="listbox" className="card p-1 absolute z-50 top-full left-0 mt-2 min-w-full">
          {characters.map((c) => (
            <button
              key={c.id}
              type="button"
              role="option"
              aria-selected={c.id === selectedId}
              onClick={() => {
                onSelect(c.id);
                setOpen(false);
              }}
              className="w-full text-left px-3 py-2 rounded-lg whitespace-nowrap hover:bg-[color:var(--color-surface-2)] transition-colors"
              style={{ backgroundColor: c.id === selectedId ? "var(--color-surface-2)" : "transparent" }}
            >
              <span className="block text-sm font-semibold" style={{ color: classColor(c.class) }}>
                {c.name}
                {c.hasSims ? " ✓" : ""}
              </span>
              <span className="block text-xs text-ink-faint">{characterRealm(c)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ItemLink({ itemId, itemName, itemIconUrl, itemQuality, isUpgrade, className }: {
  itemId: number;
  itemName: string | null;
  itemIconUrl: string | null;
  itemQuality: string | null;
  isUpgrade: boolean;
  className?: string;
}) {
  return (
    <a
      href={`https://www.wowhead.com/item=${itemId}`}
      data-wowhead={`item=${itemId}`}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-block max-w-full ${className ?? ""}`}
      style={!isUpgrade ? { filter: "grayscale(0.85)", opacity: 0.55 } : undefined}
    >
      {itemIconUrl ? (
        <img src={itemIconUrl} alt="" className="w-10 h-10 rounded" />
      ) : (
        <div className="w-10 h-10 rounded" style={{ backgroundColor: "var(--color-surface-2)" }} />
      )}
      <div className="text-sm truncate max-w-[140px] mt-1" style={{ color: isUpgrade ? qualityColor(itemQuality) : "var(--color-ink-faint)" }}>
        {itemName ?? "Item desconocido"}
      </div>
    </a>
  );
}

interface WishlistUpgrade {
  id: string;
  bossId: string;
  bossName: string;
  bossOrderIndex: number;
  bossImageUrl: string | null;
  itemId: number;
  itemName: string | null;
  itemIconUrl: string | null;
  itemSlot: string | null;
  itemQuality: string | null;
  ilvl: number;
  difficulty: WishlistDifficulty | null;
  upgradePct: number;
  upgradeAbsolute: number | null;
  priority: number | null;
  isTierPiece: boolean;
  source: string;
}

interface CharacterSim {
  id: string;
  provider: "raidbots" | "qelive";
  metricType: "dps" | "hps";
  simUrl: string;
  spec: string | null;
  specIconUrl: string | null;
  fightStyle: string | null;
  importedAt: string;
  baselineOutput: number | null;
  isStale: boolean;
  upgrades: WishlistUpgrade[];
}

function SpecIcon({ url, size = 20 }: { url: string | null; size?: number }) {
  if (!url) return null;
  return <img src={url} alt="" className="rounded-sm shrink-0" style={{ width: size, height: size }} />;
}

const PROVIDER_LABEL: Record<string, string> = {
  raidbots: "Raidbots Droptimizer",
  qelive: "QE Live",
};

function valueText(u: { upgradePct: number; upgradeAbsolute: number | null; metricType: string }, mode: "pct" | "abs"): string {
  if (mode === "abs" && u.upgradeAbsolute != null) {
    return `+${Math.round(u.upgradeAbsolute).toLocaleString("es-CL")} ${metricLabel(u.metricType)}`;
  }
  return `+${u.upgradePct.toFixed(1)}% ${metricLabel(u.metricType)}`;
}

function UpgradeBadge({ u, metricType, mode }: { u: WishlistUpgrade; metricType: string; mode: "pct" | "abs" }) {
  const color = UPGRADE_TIER_COLORS[upgradeBadgeTier(u.upgradePct)];
  return (
    <span
      className="text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
      style={{
        color,
        backgroundColor: `color-mix(in srgb, ${color} 16%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 40%, transparent)`,
      }}
    >
      {valueText({ ...u, metricType }, mode)}
    </span>
  );
}

interface UpgradeGroup {
  key: string;
  label: string;
  imageUrl: string | null;
  orderIndex: number;
  upgrades: WishlistUpgrade[];
}

function ItemCard({ u, sim, mode }: { u: WishlistUpgrade; sim: CharacterSim; mode: "pct" | "abs" }) {
  const isUpgrade = isRealUpgrade(u.upgradePct);
  return (
    <div className="card p-3">
      <ItemLink itemId={u.itemId} itemName={u.itemName} itemIconUrl={u.itemIconUrl} itemQuality={u.itemQuality} isUpgrade={isUpgrade} />
      <div className="text-xs text-ink-faint flex items-center gap-1.5 flex-wrap mt-1">
        {u.itemSlot && <span>{u.itemSlot}</span>}
        <span>ilvl {u.ilvl}</span>
        {u.isTierPiece && <span className="text-[color:var(--color-epic)]">Tier</span>}
      </div>
      <div className="mt-2">
        {isUpgrade ? (
          <UpgradeBadge u={u} metricType={sim.metricType} mode={mode} />
        ) : (
          <span className="text-xs text-ink-faint">No es mejora</span>
        )}
      </div>
    </div>
  );
}

function GroupCard({ sim, group, mode }: { sim: CharacterSim; group: UpgradeGroup; mode: "pct" | "abs" }) {
  return (
    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--color-surface-2)" }}>
      <div
        className="px-4 py-2 flex items-center gap-2.5"
        style={{ backgroundColor: "var(--color-surface-2)" }}
      >
        {group.imageUrl && <BossThumb imageUrl={group.imageUrl} width={40} height={20} />}
        <span className="font-heading font-semibold text-ink text-sm">{group.label}</span>
      </div>
      <div className="p-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3" style={{ backgroundColor: "var(--color-surface)" }}>
        {group.upgrades.map((u) => (
          <ItemCard key={u.id} u={u} sim={sim} mode={mode} />
        ))}
      </div>
    </div>
  );
}

function groupSimByBoss(sim: CharacterSim): UpgradeGroup[] {
  const byBoss = new Map<string, UpgradeGroup>();
  for (const u of sim.upgrades) {
    if (!byBoss.has(u.bossId)) {
      byBoss.set(u.bossId, { key: u.bossId, label: u.bossName, imageUrl: u.bossImageUrl, orderIndex: u.bossOrderIndex, upgrades: [] });
    }
    byBoss.get(u.bossId)!.upgrades.push(u);
  }
  const groups = Array.from(byBoss.values());
  groups.forEach((g) => g.upgrades.sort((a, b) => b.upgradePct - a.upgradePct));
  return groups.sort((a, b) => a.orderIndex - b.orderIndex);
}

function groupSimBySlot(sim: CharacterSim): UpgradeGroup[] {
  const bySlot = new Map<string, UpgradeGroup>();
  for (const u of sim.upgrades) {
    const key = u.itemSlot ?? "Otro";
    if (!bySlot.has(key)) {
      bySlot.set(key, { key, label: key, imageUrl: null, orderIndex: 0, upgrades: [] });
    }
    bySlot.get(key)!.upgrades.push(u);
  }
  const groups = Array.from(bySlot.values());
  groups.forEach((g) => g.upgrades.sort((a, b) => b.upgradePct - a.upgradePct));
  return groups.sort((a, b) => a.label.localeCompare(b.label));
}

const EMPTY_STATE_COPY: Record<string, { tool: string; url: string; hint: string }> = {
  heal: {
    tool: "QuestionablyEpic Live",
    url: "https://questionablyepic.com/live",
    hint: "Corre el Upgrade Finder con tu personaje y pega el link del reporte acá arriba.",
  },
  tank: {
    tool: "Raidbots Droptimizer",
    url: "https://www.raidbots.com/simbot",
    hint: "Corre un Droptimizer con tu personaje y pega el link del reporte acá arriba.",
  },
  dps: {
    tool: "Raidbots Droptimizer",
    url: "https://www.raidbots.com/simbot",
    hint: "Corre un Droptimizer con tu personaje y pega el link del reporte acá arriba.",
  },
};

export default function WishlistClient({
  canManage,
  initialPanel,
  initialViewAll,
}: {
  canManage: boolean;
  initialPanel?: string;
  initialViewAll?: boolean;
}) {
  const toast = useToast();
  const [viewMode, setViewMode] = useState<"personal" | "splits" | "sims">(initialPanel === "splits" ? "splits" : "personal");
  const [characters, setCharacters] = useState<OwnCharacter[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sims, setSims] = useState<CharacterSim[]>([]);
  const [loadingSims, setLoadingSims] = useState(false);
  const [importUrl, setImportUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importNotice, setImportNotice] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState(false);
  const [difficulty, setDifficulty] = useState<WishlistDifficulty>("mythic");
  const [tierFilter, setTierFilter] = useState<"all" | UpgradeTier>("all");
  const [groupBySlot, setGroupBySlot] = useState(false);
  const [valueMode, setValueMode] = useState<"pct" | "abs">("pct");

  useEffect(() => {
    fetch("/api/wishlist/characters")
      .then((r) => r.json())
      .then((data) => {
        const list: OwnCharacter[] = data.characters ?? [];
        setCharacters(list);
        if (list.length > 0) setSelectedId((prev) => prev ?? list[0].id);
      })
      .catch(() => {});
  }, []);

  const loadCharacterSims = useCallback((characterId: string) => {
    Promise.resolve()
      .then(() => setLoadingSims(true))
      .then(() => fetch(`/api/wishlist/character/${characterId}`))
      .then((res) => res.json())
      .then((data) => setSims(data.sims ?? []))
      .catch(() => setSims([]))
      .finally(() => setLoadingSims(false));
  }, []);

  useEffect(() => {
    if (selectedId) loadCharacterSims(selectedId);
  }, [selectedId, loadCharacterSims]);

  async function handleImport() {
    if (!importUrl.trim()) return;
    setImporting(true);
    setImportError(null);
    setImportNotice(null);
    setImportSuccess(false);
    try {
      const res = await fetch("/api/wishlist/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: importUrl.trim() }),
      });
      const data = await readJsonBody(res).catch(() => ({ error: "Respuesta inválida del servidor." }));
      if (!res.ok) {
        setImportError(data.error ?? "No se pudo importar esa simulación.");
        toast.error("No se pudo importar la simulación", data.error || undefined);
        return;
      }
      setImportUrl("");
      setImportSuccess(true);
      toast.success("Simulación importada");
      const notices: string[] = [];
      if (data.roleMismatchWarning) {
        notices.push("Este link parece ser de un rol distinto al de este personaje, ¿es correcto?");
      }
      if (data.unmatchedBossCount > 0) {
        notices.push(`${data.unmatchedBossCount} item(s) no se pudieron ubicar en la temporada actual y se omitieron.`);
      }
      setImportNotice(notices.join(" ") || null);
      setSelectedId(data.character.id);
      if (!characters.some((c) => c.id === data.character.id)) {
        fetch("/api/wishlist/characters")
          .then((r) => r.json())
          .then((d) => setCharacters(d.characters ?? []));
      }
      loadCharacterSims(data.character.id);
    } catch {
      setImportError("No se pudo importar esa simulación.");
    } finally {
      setImporting(false);
    }
  }

  const selectedCharacter = characters.find((c) => c.id === selectedId) ?? null;

  const visibleSims = sims
    .map((sim) => ({
      ...sim,
      upgrades: sim.upgrades.filter(
        (u) =>
          u.difficulty === difficulty &&
          (tierFilter === "all" || (isRealUpgrade(u.upgradePct) && upgradeBadgeTier(u.upgradePct) === tierFilter))
      ),
    }))
    .filter((sim) => sim.upgrades.length > 0 || sims.length === 1);

  return (
    <div>
      <PageHeader
        eyebrow="Raid"
        icon={Gem}
        title="Wishlist"
        description={
          viewMode === "sims"
            ? "Simulaciones subidas por todo el guild"
            : viewMode === "splits"
            ? canManage
              ? "Wishlist del guild por jefe"
              : "Lista de splits"
            : "Tus prioridades de mejora por jefe"
        }
        actions={
          <>
        <div className="flex gap-2">
          <button
            onClick={() => setViewMode("personal")}
            className={`btn ${viewMode === "personal" ? "btn-primary" : "btn-secondary"}`}
          >
            Mi wishlist
          </button>
          <button
            onClick={() => setViewMode("splits")}
            className={`btn ${viewMode === "splits" ? "btn-primary" : "btn-secondary"}`}
          >
            Splits
          </button>
          {canManage && (
            <button
              onClick={() => setViewMode("sims")}
              className={`btn ${viewMode === "sims" ? "btn-primary" : "btn-secondary"}`}
            >
              Droptimizers
            </button>
          )}
        </div>
          </>
        }
      />

      {viewMode === "sims" ? (
        <SimsAdminPanel />
      ) : viewMode === "splits" ? (
        <SplitsBoard canManage={canManage} initialViewingAll={initialViewAll ?? false} />
      ) : (
        <div>
          {characters.length > 1 && (
            <div className="mb-4">
              <CharacterSelect characters={characters} selectedId={selectedId} onSelect={setSelectedId} />
            </div>
          )}

          <div className="card p-5 mb-6">
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                value={importUrl}
                onChange={(e) => setImportUrl(e.target.value)}
                placeholder="Pega tu link de Raidbots o de QE Live"
                className="input flex-1"
                onKeyDown={(e) => e.key === "Enter" && handleImport()}
              />
              <button onClick={handleImport} disabled={importing || !importUrl.trim()} className="btn btn-primary shrink-0">
                {importing ? "Importando..." : "Actualizar simulación"}
              </button>
            </div>
            {importSuccess && (
              <p className="text-sm mt-3 flex items-center gap-1.5" style={{ color: "var(--color-success)" }}>
                <CheckCircle2 className="w-4 h-4" /> Reporte importado correctamente.
              </p>
            )}
            {importError && (
              <p className="text-sm mt-3" style={{ color: "var(--color-danger)" }}>
                {importError}
              </p>
            )}
            {importNotice && (
              <p className="text-sm mt-3" style={{ color: "var(--color-warning)" }}>
                {importNotice}
              </p>
            )}
          </div>

          {loadingSims ? (
            <p className="text-ink-faint text-sm">Cargando...</p>
          ) : sims.length === 0 ? (
            <div className="card p-6 text-center">
              <p className="text-ink-muted text-sm mb-2">
                {selectedCharacter ? `${selectedCharacter.name} todavía no tiene ninguna simulación importada.` : "Todavía no tienes personajes."}
              </p>
              {selectedCharacter &&
                (() => {
                  const copy = EMPTY_STATE_COPY[selectedCharacter.role ?? "dps"] ?? EMPTY_STATE_COPY.dps;
                  return (
                    <p className="text-ink-faint text-xs">
                      Usa{" "}
                      <a href={copy.url} target="_blank" rel="noreferrer" className="underline">
                        {copy.tool}
                      </a>
                      . {copy.hint}
                    </p>
                  );
                })()}
            </div>
          ) : (
            <div>
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <DifficultyTabs value={difficulty} onChange={setDifficulty} />
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={tierFilter}
                    onChange={(e) => setTierFilter(e.target.value as "all" | UpgradeTier)}
                    className="input"
                  >
                    <option value="all">Toda calidad</option>
                    {UPGRADE_TIERS.map((t) => (
                      <option key={t.key} value={t.key}>{t.label}</option>
                    ))}
                  </select>
                  <button onClick={() => setValueMode(valueMode === "pct" ? "abs" : "pct")} className="btn btn-secondary">
                    {valueMode === "pct" ? "Ver valor absoluto" : "Ver %"}
                  </button>
                  <button onClick={() => setGroupBySlot(!groupBySlot)} className="btn btn-secondary">
                    {groupBySlot ? "Ver por jefe" : "Ver por slot"}
                  </button>
                </div>
              </div>

              <div className="space-y-6">
                {visibleSims.map((sim) => (
                  <div key={sim.id}>
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                      <span className="font-heading font-semibold text-ink">{PROVIDER_LABEL[sim.provider]}</span>
                      {sim.spec && (
                        <span className="flex items-center gap-1.5 text-sm" style={{ color: classColor(selectedCharacter?.class) }}>
                          <SpecIcon url={sim.specIconUrl} />
                          {sim.spec}
                        </span>
                      )}
                      <span
                        className="text-xs font-semibold px-2 py-0.5 rounded-full"
                        style={{
                          color: sim.isStale ? "var(--color-danger)" : "var(--color-success)",
                          backgroundColor: `color-mix(in srgb, ${sim.isStale ? "var(--color-danger)" : "var(--color-success)"} 14%, transparent)`,
                        }}
                      >
                        {sim.isStale ? "Desactualizado" : "Actualizado"}
                      </span>
                      {sim.baselineOutput != null && (
                        <span
                          className="text-xs font-semibold px-2 py-0.5 rounded-full"
                          title="DPS/HPS total del droptimizer con el gear actual (no la ganancia de un ítem puntual)"
                          style={{
                            color: "var(--color-primary)",
                            backgroundColor: "color-mix(in srgb, var(--color-primary) 14%, transparent)",
                          }}
                        >
                          Total: {Math.round(sim.baselineOutput).toLocaleString("es-CL")} {metricLabel(sim.metricType)}
                        </span>
                      )}
                      <span className="text-ink-faint text-xs">
                        importado {new Date(sim.importedAt).toLocaleDateString("es-CL")}
                      </span>
                    </div>
                    {sim.upgrades.length === 0 ? (
                      <p className="text-ink-faint text-sm">Sin mejoras en esta dificultad todavía.</p>
                    ) : (
                      <div className="space-y-3">
                        {(groupBySlot ? groupSimBySlot(sim) : groupSimByBoss(sim)).map((group, idx) => (
                          <div key={group.key} className="cascade-item" style={cascadeStyle(idx)}>
                            <GroupCard sim={sim} group={group} mode={valueMode} />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
