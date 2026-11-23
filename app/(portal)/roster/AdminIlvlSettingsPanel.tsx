"use client";

import { useState } from "react";
import { Settings, X } from "lucide-react";
import { readJsonBody } from "@/lib/read-json";
import IconBadge from "@/app/components/dashboard/IconBadge";
import { type RaidDifficulty } from "@/lib/roster-ilvl-defaults";
import { type RaidScheduleSlot } from "@/lib/raid-schedule-defaults";


export default function AdminIlvlSettingsPanel({
  ilvlDefaults,
  onSaved,
  scheduleSlots,
  onScheduleSaved,
}: {
  ilvlDefaults: Record<RaidDifficulty, number>;
  onSaved: (defaults: Record<RaidDifficulty, number>) => void;
  scheduleSlots: RaidScheduleSlot[];
  onScheduleSaved: (slots: RaidScheduleSlot[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [drafts, setDrafts] = useState<Record<RaidDifficulty, string>>({
    heroic: String(ilvlDefaults.heroic),
    mythic: String(ilvlDefaults.mythic),
  });
  const [scheduleDrafts, setScheduleDrafts] = useState<{ hour: string; minute: string }[]>(
    scheduleSlots.map((s) => ({ hour: String(s.hour), minute: String(s.minute) }))
  );
  const [scheduleError, setScheduleError] = useState("");
  const [savingSchedule, setSavingSchedule] = useState(false);

  async function handleOpen() {
    setOpen(true);
    if (loaded) return;
    setLoading(true);
    try {
      const [ilvlRes, scheduleRes] = await Promise.all([
        fetch("/api/roster/ilvl-defaults"),
        fetch("/api/roster/schedule-defaults"),
      ]);
      const ilvlData = await ilvlRes.json();
      if (ilvlRes.ok) {
        setDrafts({ heroic: String(ilvlData.heroic), mythic: String(ilvlData.mythic) });
        onSaved({ heroic: ilvlData.heroic, mythic: ilvlData.mythic });
      }
      const scheduleData = await scheduleRes.json();
      if (scheduleRes.ok && scheduleData.slots) {
        setScheduleDrafts(
          (scheduleData.slots as RaidScheduleSlot[]).map((s) => ({
            hour: String(s.hour),
            minute: String(s.minute),
          }))
        );
        onScheduleSaved(scheduleData.slots);
      }
      setLoaded(true);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setError("");
    const heroic = Number(drafts.heroic);
    const mythic = Number(drafts.mythic);

    if (!Number.isFinite(heroic) || heroic < 0 || !Number.isFinite(mythic) || mythic < 0) {
      setError("El ilvl mínimo debe ser un número mayor o igual a 0.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/roster/ilvl-defaults", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ heroic, mythic }),
      });
      const data = await readJsonBody(res);
      if (!res.ok) {
        setError(data.error || "No se pudo guardar.");
        return;
      }
      setDrafts({ heroic: String(data.heroic), mythic: String(data.mythic) });
      onSaved({ heroic: data.heroic, mythic: data.mythic });
      setLoaded(true);
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveSchedule() {
    setScheduleError("");
    const parsed = scheduleDrafts.map((d, i) => ({
      slotIndex: i + 1,
      hour: Number(d.hour),
      minute: Number(d.minute),
    }));
    for (const p of parsed) {
      if (!Number.isInteger(p.hour) || p.hour < 0 || p.hour > 23 || !Number.isInteger(p.minute) || p.minute < 0 || p.minute > 59) {
        setScheduleError("Cada horario necesita una hora (0-23) y minuto (0-59) válidos.");
        return;
      }
    }

    setSavingSchedule(true);
    try {
      const res = await fetch("/api/roster/schedule-defaults", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slots: parsed }),
      });
      const data = await readJsonBody(res);
      if (!res.ok) {
        setScheduleError(data.error || "No se pudo guardar.");
        return;
      }
      setScheduleDrafts(
        (data.slots as RaidScheduleSlot[]).map((s) => ({ hour: String(s.hour), minute: String(s.minute) }))
      );
      onScheduleSaved(data.slots);
    } finally {
      setSavingSchedule(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={handleOpen}
        className="flex items-center gap-1.5 text-xs text-ink-faint hover:text-ink transition-colors mb-5"
      >
        <Settings className="w-3.5 h-3.5" />
        Configuraciones
      </button>
    );
  }

  return (
    <div className="card p-4 mb-5 w-fit">
      <div className="flex items-start justify-between gap-3 mb-3.5">
        <div className="flex items-center gap-2.5">
          <IconBadge icon={Settings} color="var(--color-gold)" size="sm" />
          <div>
            <h3 className="font-heading text-sm font-bold text-ink whitespace-nowrap">
              Ilvl mínimo de las tarjetas HC / M
            </h3>
            <p className="text-ink-faint text-xs">Aplica a todo el guild</p>
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

      {loading ? (
        <p className="text-ink-faint text-xs py-2">Cargando...</p>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <span className="text-xs text-ink-muted w-28 shrink-0">Heroico (HC)</span>
            <input
              type="number"
              min={0}
              value={drafts.heroic}
              onChange={(e) => setDrafts((prev) => ({ ...prev, heroic: e.target.value }))}
              className="input px-2.5 py-1.5 text-sm w-28"
            />
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-ink-muted w-28 shrink-0">Mítico (M)</span>
            <input
              type="number"
              min={0}
              value={drafts.mythic}
              onChange={(e) => setDrafts((prev) => ({ ...prev, mythic: e.target.value }))}
              className="input px-2.5 py-1.5 text-sm w-28"
            />
          </div>

          {error && (
            <p className="text-xs" style={{ color: "var(--color-danger)" }}>
              {error}
            </p>
          )}

          <button onClick={handleSave} disabled={saving} className="btn btn-primary self-start !px-4 !py-1.5 text-xs">
            {saving ? "Guardando..." : "Guardar"}
          </button>

          <div className="border-t border-line pt-3 mt-1">
            <h4 className="font-heading text-xs font-bold text-ink mb-0.5">Horarios de raid (EST)</h4>
            <p className="text-ink-faint text-label mb-2.5">Chips rápidos de fecha, siempre hora del Este</p>
            <div className="flex flex-col gap-2">
              {scheduleDrafts.map((d, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs text-ink-muted w-10 shrink-0">#{i + 1}</span>
                  <input
                    type="number"
                    min={0}
                    max={23}
                    value={d.hour}
                    onChange={(e) =>
                      setScheduleDrafts((prev) =>
                        prev.map((s, si) => (si === i ? { ...s, hour: e.target.value } : s))
                      )
                    }
                    aria-label={`Hora del horario ${i + 1}`}
                    className="input px-2 py-1.5 text-sm w-14 text-center"
                  />
                  <span className="text-ink-faint text-xs">:</span>
                  <input
                    type="number"
                    min={0}
                    max={59}
                    value={d.minute}
                    onChange={(e) =>
                      setScheduleDrafts((prev) =>
                        prev.map((s, si) => (si === i ? { ...s, minute: e.target.value } : s))
                      )
                    }
                    aria-label={`Minuto del horario ${i + 1}`}
                    className="input px-2 py-1.5 text-sm w-14 text-center"
                  />
                </div>
              ))}
            </div>

            {scheduleError && (
              <p className="text-xs mt-2" style={{ color: "var(--color-danger)" }}>
                {scheduleError}
              </p>
            )}

            <button
              onClick={handleSaveSchedule}
              disabled={savingSchedule}
              className="btn btn-primary self-start !px-4 !py-1.5 text-xs mt-3"
            >
              {savingSchedule ? "Guardando..." : "Guardar horarios"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
