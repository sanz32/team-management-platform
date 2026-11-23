"use client";

import { useEffect, useState } from "react";
import { X, ClipboardPaste } from "lucide-react";
import { cascadeStyle } from "@/lib/cascade";
import PageHeader from "@/app/components/PageHeader";
import { readJsonBody } from "@/lib/read-json";

interface NamedAmount {
  player_name: string;
  amount: number;
}

interface MergedRow {
  player_name: string;
  balance_gold: number;
  balance_usd: number;
}

function parseAmount(raw: string): number {
  const n = Number(raw.replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

function parseNamedAmounts(text: string): NamedAmount[] {
  const rows: NamedAmount[] = [];
  let pendingName: string | null = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const cols = line.split("\t").map((c) => c.trim());

    if (/^player$/i.test(cols[0])) {
      pendingName = null;
      continue;
    }

    if (cols.length >= 5) {
      rows.push({ player_name: cols[0], amount: parseAmount(cols[4]) });
      pendingName = null;
      continue;
    }

    if (cols.length === 4 && pendingName) {
      rows.push({ player_name: pendingName, amount: parseAmount(cols[3]) });
      pendingName = null;
      continue;
    }

    if (cols.length === 1) {
      pendingName = cols[0];
      continue;
    }

    pendingName = null;
  }

  return rows;
}

function mergeRows(goldRows: NamedAmount[], usdRows: NamedAmount[]): MergedRow[] {
  const byKey = new Map<string, MergedRow>();

  for (const r of goldRows) {
    const key = r.player_name.toLowerCase();
    const existing = byKey.get(key);
    if (existing) existing.balance_gold = r.amount;
    else byKey.set(key, { player_name: r.player_name, balance_gold: r.amount, balance_usd: 0 });
  }

  for (const r of usdRows) {
    const key = r.player_name.toLowerCase();
    const existing = byKey.get(key);
    if (existing) existing.balance_usd = r.amount;
    else byKey.set(key, { player_name: r.player_name, balance_gold: 0, balance_usd: r.amount });
  }

  return Array.from(byKey.values());
}

export default function BalancePasteImport() {
  const [rawGold, setRawGold] = useState("");
  const [rawUsd, setRawUsd] = useState("");
  const [preview, setPreview] = useState<MergedRow[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [memberUsernames, setMemberUsernames] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch("/api/admin/import-balance")
      .then((res) => res.json())
      .then((data) => {
        const usernames = (data.members ?? [])
          .map((m: { discord_username: string | null }) => (m.discord_username ?? "").toLowerCase())
          .filter((u: string) => u.length > 0);
        setMemberUsernames(new Set(usernames));
      })
      .catch(() => {});
  }, []);

  function handlePreview() {
    setError("");
    setMessage("");
    const merged = mergeRows(parseNamedAmounts(rawGold), parseNamedAmounts(rawUsd));
    if (merged.length === 0) {
      setPreview(null);
      setError("No se detectaron filas válidas en el texto pegado.");
      return;
    }
    setPreview(merged);
  }

  function removeRow(index: number) {
    setPreview((prev) => (prev ? prev.filter((_, i) => i !== index) : prev));
  }

  async function handleSave() {
    if (!preview || preview.length === 0) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/admin/import-balance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: preview }),
      });
      const data = await readJsonBody(res);
      if (!res.ok) {
        setError(data.error || "No se pudo guardar la importación.");
        return;
      }
      setMessage(
        `Listo: ${data.imported} jugador(es) importado(s)/actualizado(s), ${data.matched} matchearon con un miembro real (se sumó a su Balance actual), ${data.unmatched} sin match.`
      );
      setPreview(null);
      setRawGold("");
      setRawUsd("");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Economía"
        icon={ClipboardPaste}
        title="Importar Balance"
        description="Pega la misma tabla de la plataforma externa (pantalla de balance) dos veces: una con los valores en Gold y otra con los valores en Dólar (USD)."
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-xs text-ink-muted mb-1.5 font-semibold uppercase tracking-wide">
            Balance Gold
          </label>
          <textarea
            value={rawGold}
            onChange={(e) => {
              setRawGold(e.target.value);
              setPreview(null);
            }}
            rows={10}
            className="input w-full font-mono text-xs"
          />
        </div>
        <div>
          <label className="block text-xs text-ink-muted mb-1.5 font-semibold uppercase tracking-wide">
            Balance Dólar (USD)
          </label>
          <textarea
            value={rawUsd}
            onChange={(e) => {
              setRawUsd(e.target.value);
              setPreview(null);
            }}
            rows={10}
            className="input w-full font-mono text-xs"
          />
        </div>
      </div>

      <div className="flex gap-3 mb-6">
        <button
          type="button"
          onClick={handlePreview}
          disabled={(!rawGold.trim() && !rawUsd.trim()) || saving}
          className="btn btn-secondary"
        >
          Previsualizar
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!preview || preview.length === 0 || saving}
          className="btn btn-primary"
        >
          {saving ? "Guardando..." : "Guardar en base de datos"}
        </button>
      </div>

      {message && (
        <div
          className="text-sm rounded-xl p-4 mb-6"
          style={{
            backgroundColor: "color-mix(in srgb, var(--color-success) 12%, transparent)",
            border: "1px solid color-mix(in srgb, var(--color-success) 35%, transparent)",
            color: "var(--color-success)",
          }}
        >
          {message}
        </div>
      )}
      {error && (
        <div
          className="text-sm rounded-xl p-4 mb-6"
          style={{
            backgroundColor: "color-mix(in srgb, var(--color-danger) 12%, transparent)",
            border: "1px solid color-mix(in srgb, var(--color-danger) 35%, transparent)",
            color: "var(--color-danger)",
          }}
        >
          {error}
        </div>
      )}

      {preview && preview.length > 0 && (
        <div>
          <p className="text-ink-muted text-xs uppercase tracking-wide font-semibold mb-3">
            {preview.length} fila(s) detectada(s) — revisá antes de guardar
          </p>
          <div className="card overflow-x-auto max-w-2xl">
            <table className="w-full text-sm">
              <thead className="text-ink-faint text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left px-5 py-3.5 font-semibold">Player</th>
                  <th className="text-left px-5 py-3.5 font-semibold">Balance Gold</th>
                  <th className="text-left px-5 py-3.5 font-semibold">Balance USD</th>
                  <th className="text-left px-5 py-3.5 font-semibold">Discord</th>
                  <th className="px-5 py-3.5" aria-hidden />
                </tr>
              </thead>
              <tbody>
                {preview.map((row, i) => {
                  const matched = memberUsernames.has(row.player_name.toLowerCase());
                  return (
                    <tr
                      key={row.player_name}
                      className="border-t border-line cascade-item"
                      style={cascadeStyle(i)}
                    >
                      <td className="px-5 py-3.5 font-medium text-ink">{row.player_name}</td>
                      <td className="px-5 py-3.5 text-ink-muted">
                        {row.balance_gold.toLocaleString("es-ES")}
                      </td>
                      <td className="px-5 py-3.5 text-ink-muted">
                        {row.balance_usd.toLocaleString("es-ES")}
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          className="text-xs font-semibold px-2 py-0.5 rounded-full"
                          style={{
                            backgroundColor: matched
                              ? "color-mix(in srgb, var(--color-success) 15%, transparent)"
                              : "color-mix(in srgb, var(--color-ink-faint) 15%, transparent)",
                            color: matched ? "var(--color-success)" : "var(--color-ink-faint)",
                          }}
                        >
                          {matched ? "matchea" : "sin match"}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <button
                          type="button"
                          onClick={() => removeRow(i)}
                          title={`Quitar ${row.player_name} de la importación`}
                          className="text-ink-faint hover:text-[color:var(--color-danger)] transition-colors rounded-md p-1 hover:bg-[color:var(--color-surface-2)]"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
