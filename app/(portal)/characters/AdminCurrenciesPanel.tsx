"use client";

import { useState } from "react";
import { Coins, X } from "lucide-react";
import CurrencyIcon from "@/app/components/CurrencyIcon";
import IconBadge from "@/app/components/dashboard/IconBadge";
import { readJsonBody } from "@/lib/read-json";

interface DiscoveredCurrency {
  currencyId: number;
  name: string | null;
  currencyType: string | null;
  holders: number;
  tracked: boolean;
  iconUrl: string | null;
}

export default function AdminCurrenciesPanel({ onChanged }: { onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [currencies, setCurrencies] = useState<DiscoveredCurrency[]>([]);
  const [search, setSearch] = useState("");

  async function handleOpen() {
    setOpen(true);
    if (loaded) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/currencies");
      const data = await readJsonBody(res);
      if (res.ok) {
        setCurrencies(data.currencies ?? []);
        setLoaded(true);
      } else {
        setError(data.error ?? "No se pudieron cargar las monedas.");
      }
    } catch {
      setError("No se pudieron cargar las monedas.");
    } finally {
      setLoading(false);
    }
  }

  async function toggle(currency: DiscoveredCurrency) {
    setSavingId(currency.currencyId);
    setError("");
    try {
      const res = await fetch("/api/currencies", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currencyId: currency.currencyId, tracked: !currency.tracked }),
      });
      const data = await readJsonBody(res);
      if (!res.ok) {
        setError(data.error ?? "No se pudo guardar.");
        return;
      }
      setCurrencies((prev) =>
        prev.map((c) =>
          c.currencyId === currency.currencyId
            ? { ...c, tracked: data.tracked, iconUrl: data.iconUrl ?? c.iconUrl }
            : c
        )
      );
      onChanged();
    } catch {
      setError("No se pudo guardar.");
    } finally {
      setSavingId(null);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={handleOpen}
        className="flex items-center gap-1.5 text-xs text-ink-faint hover:text-ink transition-colors mb-5"
      >
        <Coins className="w-3.5 h-3.5" />
        Monedas visibles
      </button>
    );
  }

  const q = search.trim().toLowerCase();
  const filtered = q
    ? currencies.filter(
        (c) =>
          (c.name ?? "").toLowerCase().includes(q) ||
          (c.currencyType ?? "").toLowerCase().includes(q) ||
          String(c.currencyId).includes(q)
      )
    : currencies;
  const trackedCount = currencies.filter((c) => c.tracked).length;

  return (
    <div className="card p-4 mb-5 w-full max-w-2xl">
      <div className="flex items-start justify-between gap-3 mb-3.5">
        <div className="flex items-center gap-2.5">
          <IconBadge icon={Coins} color="var(--color-gold)" size="sm" />
          <div>
            <h3 className="font-heading text-sm font-bold text-ink whitespace-nowrap">Monedas visibles</h3>
            <p className="text-ink-faint text-xs">
              {trackedCount} elegida{trackedCount === 1 ? "" : "s"} de {currencies.length} detectadas
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-ink-faint hover:text-ink transition-colors shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <p className="text-ink-faint text-label mb-3">
        La lista se arma sola con lo que sube la app de escritorio, ordenada por
        cuántos personajes tienen saldo — las de la temporada actual quedan
        arriba. Marca las que quieras ver en las tarjetas.
      </p>

      {loading ? (
        <p className="text-ink-faint text-xs py-2">Cargando...</p>
      ) : currencies.length === 0 ? (
        <p className="text-ink-faint text-xs py-2">
          Todavía no llegó ninguna moneda. Hace falta que al menos un miembro
          sincronice con la app de escritorio.
        </p>
      ) : (
        <>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar moneda..."
            className="input px-3 py-2 text-sm w-full mb-3"
          />

          {error && (
            <p className="text-xs mb-2" style={{ color: "var(--color-danger)" }}>
              {error}
            </p>
          )}

          <div className="max-h-80 overflow-y-auto flex flex-col gap-1 pr-1">
            {filtered.map((c) => (
              <button
                key={c.currencyId}
                type="button"
                onClick={() => toggle(c)}
                disabled={savingId === c.currencyId}
                className="w-full flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-[color:var(--color-surface-2)] transition-colors disabled:opacity-50"
              >
                <CurrencyIcon url={c.iconUrl} name={c.name} />
                <span className="min-w-0 flex-1">
                  <span className="block text-xs text-ink truncate">
                    {c.name ?? `Moneda ${c.currencyId}`}
                  </span>
                  <span className="block text-micro text-ink-faint truncate">
                    {c.currencyType ?? "sin tipo"} · {c.holders} personaje
                    {c.holders === 1 ? "" : "s"} con saldo
                  </span>
                </span>
                <span
                  className="shrink-0 w-8 h-4 rounded-full transition-colors relative"
                  style={{
                    backgroundColor: c.tracked
                      ? "color-mix(in srgb, var(--color-primary) 60%, transparent)"
                      : "var(--color-line)",
                  }}
                >
                  <span
                    className="absolute top-0.5 w-3 h-3 rounded-full transition-all"
                    style={{
                      left: c.tracked ? "1.125rem" : "0.125rem",
                      backgroundColor: c.tracked ? "var(--color-primary)" : "var(--color-ink-faint)",
                    }}
                  />
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
