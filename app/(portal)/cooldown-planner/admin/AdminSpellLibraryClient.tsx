"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, RefreshCw, Search, Library } from "lucide-react";
import { classColor, classSpecs, ALL_CLASSES } from "@/lib/wow-classes";
import { readJson } from "@/lib/read-json";
import { CATEGORY_LABELS, CATEGORY_ORDER, CooldownCategory, CooldownSpell } from "@/lib/cooldown-planner/types";
import PageHeader from "@/app/components/PageHeader";

type ViewMode = "uncategorized" | "all";

export default function AdminSpellLibraryClient() {
  const [spells, setSpells] = useState<CooldownSpell[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState<string>("all");
  const [specFilter, setSpecFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("uncategorized");

  function fetchSpells(mode: ViewMode): Promise<CooldownSpell[]> {
    const query = mode === "uncategorized" ? "?uncategorized=true" : "";
    return fetch(`/api/cooldown-planner/spell-library${query}`)
      .then((res) => readJson<{ spells: CooldownSpell[] }>(res))
      .then((data) => data?.spells ?? []);
  }

  function loadSpells() {
    Promise.resolve()
      .then(() => setLoading(true))
      .then(() => fetchSpells(viewMode))
      .then((data) => {
        setSpells(data);
        setLoading(false);
      });
  }

  useEffect(() => {
    loadSpells();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode]);

  async function handleSync() {
    setSyncing(true);
    setSyncResult(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/cooldown-planner/sync-candidates", { method: "POST" });
      const data = await readJson<{ inserted: number; updated: number; totalCandidates: number; error?: string }>(res);
      if (!res.ok || !data) {
        setError(data && "error" in data ? (data.error as string) : "No se pudo sincronizar la librería.");
        return;
      }
      setSyncResult(`${data.inserted} spells nuevos, ${data.updated} actualizados (de ${data.totalCandidates} candidatos).`);
      loadSpells();
    } finally {
      setSyncing(false);
    }
  }

  async function handleCategorize(spellId: number, category: CooldownCategory) {
    const res = await fetch(`/api/admin/cooldown-planner/spell-library/${spellId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category }),
    });
    if (!res.ok) return;
    setSpells((prev) =>
      viewMode === "uncategorized"
        ? prev.filter((s) => s.spellId !== spellId)
        : prev.map((s) => (s.spellId === spellId ? { ...s, category, isCategorized: true } : s))
    );
  }

  const searchTokens = search.trim().toLowerCase().split(/\s+/).filter(Boolean);

  const availableSpecs = classFilter === "all" ? [] : classSpecs(classFilter);

  const filteredSpells = spells.filter((spell) => {
    if (classFilter !== "all" && spell.class !== classFilter) return false;
    if (specFilter !== "all" && (spell.spec ?? "") !== specFilter) return false;
    if (searchTokens.length === 0) return true;
    const haystacks = [spell.name.toLowerCase(), spell.class.toLowerCase(), (spell.spec ?? "").toLowerCase()];
    return searchTokens.every((token) => haystacks.some((h) => h.includes(token)));
  });

  const hasFilters = search.trim() !== "" || classFilter !== "all" || specFilter !== "all";

  return (
    <div>
      <Link
        href="/cooldown-planner"
        className="text-sm text-ink-muted hover:text-ink transition-colors inline-flex items-center gap-1.5 mb-4"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Volver a Cooldown Planner
      </Link>

      <PageHeader
        eyebrow="Raid"
        icon={Library}
        title="Librería de cooldowns"
        description={
          viewMode === "uncategorized"
            ? "Spells nuevos detectados por el sync, sin categorizar todavía."
            : "Todos los spells de la librería -- revisa o corrige la categoría de cualquiera."
        }
        actions={
          <button type="button" className="btn btn-secondary" disabled={syncing} onClick={handleSync}>
            <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Sincronizando..." : "Sincronizar candidatos"}
          </button>
        }
      />

      {error && (
        <div className="card p-3 mb-4 text-sm" style={{ borderColor: "var(--color-danger)", color: "var(--color-danger)" }}>
          {error}
        </div>
      )}
      {syncResult && <p className="text-sm text-ink-faint mb-4">{syncResult}</p>}

      <div className="flex gap-1 mb-4">
        <button
          type="button"
          onClick={() => setViewMode("uncategorized")}
          className={`btn text-xs px-3 py-1.5 ${viewMode === "uncategorized" ? "btn-primary" : "btn-ghost"}`}
        >
          Sin categorizar
        </button>
        <button
          type="button"
          onClick={() => setViewMode("all")}
          className={`btn text-xs px-3 py-1.5 ${viewMode === "all" ? "btn-primary" : "btn-ghost"}`}
        >
          Todas
        </button>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Busca por nombre, clase o spec (ej. paladin retri)..."
            className="input w-full pl-9"
          />
        </div>
        <select
          value={classFilter}
          onChange={(e) => {
            setClassFilter(e.target.value);
            setSpecFilter("all");
          }}
          className="input w-auto text-sm"
        >
          <option value="all">Toda clase</option>
          {ALL_CLASSES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={specFilter}
          onChange={(e) => setSpecFilter(e.target.value)}
          disabled={classFilter === "all"}
          className="input w-auto text-sm"
        >
          <option value="all">Toda spec</option>
          <option value="">Clase (sin spec)</option>
          {availableSpecs.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="text-sm text-ink-faint">Cargando...</p>
      ) : spells.length === 0 ? (
        <p className="text-sm text-ink-faint">
          {viewMode === "uncategorized" ? "No hay spells pendientes de categorizar." : "La librería está vacía."}
        </p>
      ) : filteredSpells.length === 0 ? (
        <p className="text-sm text-ink-faint">
          {hasFilters ? "Ningún spell coincide con ese filtro." : "Sin resultados."}
        </p>
      ) : (
        <div className="space-y-2">
          {filteredSpells.map((spell) => (
            <div key={spell.spellId} className="card p-3 flex items-center gap-3">
              <div
                className="w-8 h-8 rounded-md overflow-hidden shrink-0"
                style={{ backgroundColor: "var(--color-surface-2)" }}
                title={spell.name}
              >
                {spell.iconUrl && <img src={spell.iconUrl} alt="" className="w-full h-full object-cover" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink truncate">{spell.name}</p>
                <p className="text-xs text-ink-faint truncate">
                  <span style={{ color: classColor(spell.class) }}>{spell.class}</span>
                  {spell.spec ? ` · ${spell.spec}` : " · Clase"}
                  {spell.durationSeconds ? ` · ${spell.durationSeconds}s` : ""}
                </p>
              </div>
              <div className="flex gap-1 shrink-0">
                {CATEGORY_ORDER.map((category) => {
                  const active = spell.category === category;
                  return (
                    <button
                      key={category}
                      type="button"
                      onClick={() => handleCategorize(spell.spellId, category)}
                      className={`btn text-xs px-2 py-1 ${active ? "btn-primary" : "btn-ghost"}`}
                    >
                      {CATEGORY_LABELS[category]}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
