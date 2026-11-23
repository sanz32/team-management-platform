"use client";

import { useState } from "react";
import { Swords } from "lucide-react";
import { formatFightDateTime } from "@/lib/format";
import { readJsonBody } from "@/lib/read-json";

const DIFFICULTY_LABELS: Record<number, string> = { 4: "Heroico", 5: "Mítico" };
function difficultyLabel(difficulty: number | null): string {
  if (difficulty === null) return "-";
  return DIFFICULTY_LABELS[difficulty] ?? `Dificultad ${difficulty}`;
}

export interface WclFight {
  id: number;
  bossName: string;
  encounterId: number;
  difficulty: number | null;
  kill: boolean | null;
  startTime: number;
  endTime: number;
  bossPercentage: number | null;
}

interface ReportOverview {
  code: string;
  title: string | null;
  zoneName: string | null;
  startTime: number | null;
  fights: WclFight[];
}

export interface WclMatchedCharacter {
  id: string;
  name: string;
  realm_slug: string;
  class: string | null;
  active_spec: string | null;
}

export interface WclMatchedMember {
  user_id: string;
  discord_username: string;
  characters: WclMatchedCharacter[];
}

export interface WclUnknownActor {
  name: string;
  server: string | null;
  subType: string | null;
}

function formatDuration(startMs: number, endMs: number): string {
  const totalSeconds = Math.round((endMs - startMs) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

export default function WclFightPicker({
  onResolved,
  confirmLabel = "Ver personajes de estas peleas",
}: {
  onResolved: (result: {
    matched: WclMatchedMember[];
    unknown: WclUnknownActor[];
    selectedFights: WclFight[];
  }) => void;
  confirmLabel?: string;
}) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [overview, setOverview] = useState<ReportOverview | null>(null);
  const [selectedFightIds, setSelectedFightIds] = useState<Set<number>>(new Set());

  const [participantsLoading, setParticipantsLoading] = useState(false);
  const [participantsError, setParticipantsError] = useState("");

  const [resolvedSummary, setResolvedSummary] = useState<{ fights: number; matched: number } | null>(null);

  async function handleImport() {
    setLoading(true);
    setError("");
    setOverview(null);
    setSelectedFightIds(new Set());
    setResolvedSummary(null);
    try {
      const res = await fetch("/api/wcl/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await readJsonBody(res);
      if (!res.ok) {
        setError(data.error || "No se pudo importar el reporte.");
        return;
      }
      setOverview(data.report);
    } finally {
      setLoading(false);
    }
  }

  function startOver() {
    setUrl("");
    setOverview(null);
    setSelectedFightIds(new Set());
    setResolvedSummary(null);
    setError("");
    setParticipantsError("");
  }

  function toggleFight(id: number) {
    setSelectedFightIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleViewParticipants() {
    if (selectedFightIds.size === 0 || !overview) return;
    setParticipantsLoading(true);
    setParticipantsError("");
    try {
      const res = await fetch("/api/wcl/participants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, fightIds: Array.from(selectedFightIds) }),
      });
      const data = await readJsonBody(res);
      if (!res.ok) {
        setParticipantsError(data.error || "No se pudo traer los participantes.");
        return;
      }
      const selectedFights = overview.fights.filter((f) => selectedFightIds.has(f.id));
      onResolved({ matched: data.matched, unknown: data.unknown, selectedFights });
      if (data.matched.length > 0) {
        setResolvedSummary({ fights: selectedFights.length, matched: data.matched.length });
      }
    } finally {
      setParticipantsLoading(false);
    }
  }

  if (resolvedSummary) {
    return (
      <div
        className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-lg"
        style={{ backgroundColor: "var(--color-surface-2)", border: "1px solid var(--color-line)" }}
      >
        <div className="flex items-center gap-2 text-sm text-ink-muted min-w-0">
          <Swords className="w-3.5 h-3.5 text-ink-faint shrink-0" />
          <span className="truncate">
            {resolvedSummary.fights} pelea{resolvedSummary.fights === 1 ? "" : "s"} importada
            {resolvedSummary.fights === 1 ? "" : "s"} · {resolvedSummary.matched} booster
            {resolvedSummary.matched === 1 ? "" : "s"} matcheado{resolvedSummary.matched === 1 ? "" : "s"}
          </span>
        </div>
        <button type="button" onClick={startOver} className="btn btn-secondary text-xs shrink-0">
          Importar otro reporte
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex gap-2.5">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.warcraftlogs.com/reports/AbCdEfGhIjKlMnOp"
          className="input flex-1 px-3.5 py-2.5 text-sm"
        />
        <button
          type="button"
          onClick={handleImport}
          disabled={!url.trim() || loading}
          className="btn btn-secondary shrink-0"
        >
          {loading ? "Importando..." : "Importar"}
        </button>
      </div>

      {error && (
        <p className="text-xs mt-2.5" style={{ color: "var(--color-danger)" }}>
          {error}
        </p>
      )}

      {overview && (
        <div className="mt-4">
          <p className="text-ink-faint text-xs mb-2">
            {overview.title || "Reporte sin título"} · {overview.zoneName ?? "Zona desconocida"}
          </p>
          {overview.fights.length === 0 ? (
            <p className="text-ink-faint text-sm py-3 text-center">
              No se encontraron pulls de jefe en este reporte.
            </p>
          ) : (
            <div className="space-y-1.5 max-h-[320px] overflow-y-auto pr-1">
              {overview.fights.map((f) => (
                <label
                  key={f.id}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors"
                  style={{
                    backgroundColor: selectedFightIds.has(f.id) ? "var(--color-surface-2)" : "transparent",
                    border: "1px solid var(--color-line)",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedFightIds.has(f.id)}
                    onChange={() => toggleFight(f.id)}
                    className="shrink-0"
                  />
                  <Swords className="w-3.5 h-3.5 text-ink-faint shrink-0" />
                  <span className="text-sm font-medium text-ink truncate flex-1">{f.bossName}</span>
                  <span className="text-xs text-ink-faint shrink-0">{difficultyLabel(f.difficulty)}</span>
                  <span className="text-xs text-ink-faint shrink-0 font-data">
                    {formatFightDateTime(f.startTime)}
                  </span>
                  <span className="text-xs text-ink-faint shrink-0">
                    {formatDuration(f.startTime, f.endTime)}
                  </span>
                  <span className={`pill shrink-0 ${f.kill ? "pill-success" : "pill-common"}`}>
                    {f.kill ? "Kill" : `Wipe${f.bossPercentage != null ? ` ${f.bossPercentage}%` : ""}`}
                  </span>
                </label>
              ))}
            </div>
          )}

          {participantsError && (
            <p className="text-xs mt-2.5" style={{ color: "var(--color-danger)" }}>
              {participantsError}
            </p>
          )}

          {overview.fights.length > 0 && (
            <button
              type="button"
              onClick={handleViewParticipants}
              disabled={selectedFightIds.size === 0 || participantsLoading}
              className="btn btn-primary mt-3"
            >
              {participantsLoading ? "Buscando..." : `${confirmLabel} (${selectedFightIds.size})`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
