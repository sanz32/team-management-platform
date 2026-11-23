"use client";

import { useEffect, useState } from "react";
import { Timer, Swords } from "lucide-react";
import { getLockoutWeekStart } from "@/lib/wow-reset";
import IconBadge from "./IconBadge";
import RaidUnsavedRow, { type RaidUnsavedRowRaid } from "../RaidUnsavedRow";

interface Countdown {
  days: number;
  hours: number;
  minutes: number;
}

function nextResetCountdown(): Countdown {
  const nextReset = new Date(getLockoutWeekStart("us").getTime() + 7 * 24 * 60 * 60 * 1000);
  const totalMinutes = Math.max(0, Math.floor((nextReset.getTime() - Date.now()) / 60_000));
  return {
    days: Math.floor(totalMinutes / (60 * 24)),
    hours: Math.floor((totalMinutes % (60 * 24)) / 60),
    minutes: totalMinutes % 60,
  };
}

function CountdownDigit({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex items-baseline gap-1">
      <span className="font-data text-4xl font-bold text-ink">{value.toString().padStart(2, "0")}</span>
      <span className="text-sm text-ink-faint">{label}</span>
    </div>
  );
}

export default function FriendRaidConsole({ unsavedByRaid }: { unsavedByRaid: RaidUnsavedRowRaid[] }) {
  const [countdown, setCountdown] = useState<Countdown | null>(null);

  useEffect(() => {
    const tick = () => setCountdown(nextResetCountdown());
    const raf = requestAnimationFrame(tick);
    const id = setInterval(tick, 60_000);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(id);
    };
  }, []);

  return (
    <div className="hud-panel px-5 py-4 flex items-stretch gap-6 flex-wrap">
      <div className="flex flex-col justify-center gap-2 shrink-0">
        <div className="flex items-center gap-2.5">
          <IconBadge icon={Timer} color="var(--color-primary)" size="lg" />
          <span className="text-caption whitespace-nowrap">Reinicio semanal</span>
        </div>
        <div className="flex items-center gap-1.5">
          {countdown ? (
            <>
              <CountdownDigit value={countdown.days} label="d" />
              <span className="text-ink-faint">:</span>
              <CountdownDigit value={countdown.hours} label="h" />
              <span className="text-ink-faint">:</span>
              <CountdownDigit value={countdown.minutes} label="m" />
            </>
          ) : (
            <span className="font-data text-4xl text-ink-faint">--:--:--</span>
          )}
        </div>
      </div>

      <div className="w-px self-stretch bg-line shrink-0" aria-hidden />

      <div className="flex flex-col justify-center gap-2 min-w-0 flex-1">
        <div className="flex items-center gap-x-2.5 gap-y-1 flex-wrap">
          <IconBadge icon={Swords} color="var(--color-primary)" size="lg" />
          <span className="text-caption whitespace-nowrap">Personajes unsaved por raid</span>
        </div>
        <div className="flex flex-wrap gap-3">
          {unsavedByRaid.map((raid) => (
            <div key={raid.key} className="flex-1 min-w-[180px]">
              <RaidUnsavedRow raid={raid} size="lg" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
