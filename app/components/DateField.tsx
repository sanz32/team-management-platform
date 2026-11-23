"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

const WEEKDAY_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MONTH_LABELS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

interface ParsedValue {
  date: Date | null;
  hour: number;
  minute: number;
}

function parseValue(value: string): ParsedValue {
  if (!value || value.length < 10) return { date: null, hour: 18, minute: 0 };
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return { date: null, hour: 18, minute: 0 };
  const date = new Date(y, m - 1, d);
  let hour = 18;
  let minute = 0;
  if (value.length >= 16) {
    const [h, mi] = value.slice(11, 16).split(":").map(Number);
    if (!Number.isNaN(h)) hour = h;
    if (!Number.isNaN(mi)) minute = mi;
  }
  return { date, hour, minute };
}

function formatDisplay(value: string, mode: "date" | "datetime"): string {
  const { date, hour, minute } = parseValue(value);
  if (!date) return "";
  const datePart = `${date.getDate()} de ${MONTH_LABELS[date.getMonth()]} de ${date.getFullYear()}`;
  return mode === "datetime" ? `${datePart}, ${pad(hour)}:${pad(minute)}` : datePart;
}

function dayKey(year: number, month: number, day: number): string {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

export default function DateField({
  value,
  onChange,
  mode = "date",
  placeholder = "Elige una fecha",
  className = "",
  minDate,
  maxDate,
}: {
  value: string;
  onChange: (value: string) => void;
  mode?: "date" | "datetime";
  placeholder?: string;
  className?: string;
  minDate?: string;
  maxDate?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const parsed = parseValue(value);

  const [viewYear, setViewYear] = useState(() => (parsed.date ?? new Date()).getFullYear());
  const [viewMonth, setViewMonth] = useState(() => (parsed.date ?? new Date()).getMonth());
  const [pendingDay, setPendingDay] = useState<{ year: number; month: number; day: number } | null>(
    parsed.date
      ? { year: parsed.date.getFullYear(), month: parsed.date.getMonth(), day: parsed.date.getDate() }
      : null
  );
  const [hour, setHour] = useState(parsed.hour);
  const [minute, setMinute] = useState(parsed.minute);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  function openPicker() {
    const base = parsed.date ?? new Date();
    setViewYear(base.getFullYear());
    setViewMonth(base.getMonth());
    setHour(parsed.hour);
    setMinute(parsed.minute);
    setPendingDay(
      parsed.date
        ? { year: parsed.date.getFullYear(), month: parsed.date.getMonth(), day: parsed.date.getDate() }
        : null
    );
    setOpen(true);
  }

  function changeMonth(delta: number) {
    let y = viewYear;
    let m = viewMonth + delta;
    if (m < 0) {
      m = 11;
      y -= 1;
    } else if (m > 11) {
      m = 0;
      y += 1;
    }
    setViewYear(y);
    setViewMonth(m);
  }

  function commit(year: number, month: number, day: number, h: number, mi: number) {
    const iso = `${year}-${pad(month + 1)}-${pad(day)}`;
    onChange(mode === "datetime" ? `${iso}T${pad(h)}:${pad(mi)}` : iso);
  }

  function isDayDisabled(day: number): boolean {
    const key = dayKey(viewYear, viewMonth, day);
    if (minDate && key < minDate) return true;
    if (maxDate && key > maxDate) return true;
    return false;
  }

  function pickDay(day: number) {
    if (isDayDisabled(day)) return;
    if (mode === "date") {
      commit(viewYear, viewMonth, day, hour, minute);
      setOpen(false);
    } else {
      setPendingDay({ year: viewYear, month: viewMonth, day });
    }
  }

  function applyDateTime() {
    if (!pendingDay) return;
    commit(pendingDay.year, pendingDay.month, pendingDay.day, hour, minute);
    setOpen(false);
  }

  function pickToday() {
    const now = new Date();
    setViewYear(now.getFullYear());
    setViewMonth(now.getMonth());
    if (mode === "date") {
      commit(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute);
      setOpen(false);
    } else {
      setPendingDay({ year: now.getFullYear(), month: now.getMonth(), day: now.getDate() });
    }
  }

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const leadingBlanks = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7;
  const today = new Date();

  const display = formatDisplay(value, mode);

  return (
    <div className={`relative ${className}`} ref={ref}>
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openPicker())}
        className="input px-3 py-2 text-sm w-full flex items-center justify-between gap-2 text-left"
      >
        <span className={display ? "text-ink" : "text-ink-faint"}>{display || placeholder}</span>
        <CalendarDays className="w-4 h-4 text-ink-faint shrink-0" />
      </button>

      {open && (
        <div
          className="card p-4 absolute z-50 top-full left-0 mt-2 w-[280px]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-3">
            <button
              type="button"
              onClick={() => changeMonth(-1)}
              className="text-ink-faint hover:text-ink p-1 rounded transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <p className="text-sm font-semibold text-ink">
              {MONTH_LABELS[viewMonth]} {viewYear}
            </p>
            <button
              type="button"
              onClick={() => changeMonth(1)}
              className="text-ink-faint hover:text-ink p-1 rounded transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 mb-1">
            {WEEKDAY_LABELS.map((w) => (
              <div key={w} className="text-ink-faint text-micro font-semibold text-center py-1">
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: leadingBlanks }, (_, i) => (
              <div key={`blank-${i}`} />
            ))}
            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
              const isToday =
                today.getFullYear() === viewYear && today.getMonth() === viewMonth && today.getDate() === day;
              const isSelected =
                pendingDay?.year === viewYear && pendingDay?.month === viewMonth && pendingDay?.day === day;
              const disabled = isDayDisabled(day);
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => pickDay(day)}
                  disabled={disabled}
                  className="aspect-square rounded-lg text-xs font-medium transition-colors"
                  style={
                    disabled
                      ? { color: "var(--color-ink-faint)", opacity: 0.4, cursor: "not-allowed" }
                      : isSelected
                        ? { backgroundColor: "var(--color-primary)", color: "white" }
                        : isToday
                          ? {
                              border: "1px solid var(--color-primary)",
                              color: "var(--color-primary)",
                            }
                          : { color: "var(--color-ink)" }
                  }
                  onMouseEnter={(e) => {
                    if (!isSelected && !disabled) e.currentTarget.style.backgroundColor = "var(--color-surface-2)";
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected && !disabled) e.currentTarget.style.backgroundColor = "transparent";
                  }}
                >
                  {day}
                </button>
              );
            })}
          </div>

          {mode === "datetime" && (
            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-line">
              <select
                value={hour}
                onChange={(e) => setHour(Number(e.target.value))}
                className="input px-2 py-1.5 text-xs flex-1"
              >
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>
                    {pad(h)}
                  </option>
                ))}
              </select>
              <span className="text-ink-faint text-xs">:</span>
              <select
                value={minute}
                onChange={(e) => setMinute(Number(e.target.value))}
                className="input px-2 py-1.5 text-xs flex-1"
              >
                {Array.from({ length: 12 }, (_, i) => i * 5).map((m) => (
                  <option key={m} value={m}>
                    {pad(m)}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex items-center justify-between gap-2 mt-3 pt-3 border-t border-line">
            <button
              type="button"
              onClick={pickToday}
              className="text-xs font-semibold hover:opacity-80 transition-opacity"
              style={{ color: "var(--color-secondary)" }}
            >
              Hoy
            </button>
            {mode === "datetime" && (
              <button type="button" onClick={applyDateTime} disabled={!pendingDay} className="btn btn-primary !px-3 !py-1.5 text-xs">
                Aplicar
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
