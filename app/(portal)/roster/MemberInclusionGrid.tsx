"use client";

import { useEffect, useState } from "react";
import { UserX } from "lucide-react";
import OvertimeBadge from "../../components/OvertimeBadge";

interface Member {
  user_id: string;
  discord_username: string;
  nickname: string | null;
  avatar_url: string | null;
  has_mochila: boolean;
  characterCount: number;
  hasDayOff: boolean;
}

export default function MemberInclusionGrid({
  date,
  excludedUserIds,
  onToggle,
  onMembersLoaded,
  onContinue,
}: {
  date: string | null;
  excludedUserIds: Set<string>;
  onToggle: (userId: string) => void;
  onMembersLoaded: (dayOffUserIds: string[]) => void;
  onContinue: () => void;
}) {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    const qs = date ? `?date=${encodeURIComponent(date)}` : "";
    fetch(`/api/roster/members${qs}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        const list = (data.members ?? []) as Member[];
        setMembers(list);
        onMembersLoaded(list.filter((m) => m.hasDayOff).map((m) => m.user_id));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const includedCount = members.filter((m) => !excludedUserIds.has(m.user_id)).length;

  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h3 className="font-heading text-sm font-bold text-ink">¿Quién entra a este roster?</h3>
          <p className="text-ink-faint text-xs mt-0.5">
            Todos empiezan encendidos. Apaga a quien no vaya a jugar esta run -- quien tenga día libre
            programado ya arranca apagado, prendelo si va a hacer horas extra (OT).
          </p>
        </div>
        <span className="font-data text-xs text-ink-faint whitespace-nowrap">
          {includedCount} / {members.length} adentro
        </span>
      </div>

      {loading ? (
        <p className="text-ink-faint text-sm text-center py-10">Cargando miembros...</p>
      ) : members.length === 0 ? (
        <p className="text-ink-faint text-sm text-center py-10">
          No hay personajes registrados con rol e ilvl todavía.
        </p>
      ) : (
        <div className="flex flex-wrap justify-center gap-3">
          {members.map((m) => (
            <MemberCard
              key={m.user_id}
              member={m}
              excluded={excludedUserIds.has(m.user_id)}
              onToggle={() => onToggle(m.user_id)}
            />
          ))}
        </div>
      )}

      <div className="flex justify-end pt-4 mt-2 border-t border-line">
        <button type="button" onClick={onContinue} disabled={!date} className="btn btn-primary">
          Continuar
        </button>
      </div>
    </div>
  );
}

function MemberCard({
  member,
  excluded,
  onToggle,
}: {
  member: Member;
  excluded: boolean;
  onToggle: () => void;
}) {
  const name = member.nickname ?? member.discord_username;
  const isOn = !excluded;
  const showDayOffLabel = member.hasDayOff && !isOn;
  const showOtBadge = member.hasDayOff && isOn;
  const showExcludedLabel = !isOn && !member.hasDayOff;

  return (
    <button
      type="button"
      onClick={onToggle}
      title={name}
      className="flex flex-col items-center gap-1 w-20 rounded-lg py-2 px-1 transition-all"
      style={{
        backgroundColor: isOn ? "transparent" : "color-mix(in srgb, var(--color-danger) 8%, transparent)",
        border: showOtBadge
          ? "1px solid var(--color-warning)"
          : showDayOffLabel
            ? "1px solid var(--color-warning)"
            : showExcludedLabel
              ? "1px dashed color-mix(in srgb, var(--color-danger) 55%, transparent)"
              : "1px solid transparent",
      }}
    >
      <div className="relative">
        {member.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={member.avatar_url}
            alt=""
            width={48}
            height={48}
            className="w-12 h-12 rounded-full object-cover"
            style={!isOn ? { filter: "grayscale(1)" } : undefined}
          />
        ) : (
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center font-heading font-bold text-sm"
            style={{
              backgroundColor: "var(--color-surface-2)",
              color: "var(--color-ink-muted)",
              filter: !isOn ? "grayscale(1)" : undefined,
            }}
          >
            {name.slice(0, 1).toUpperCase()}
          </div>
        )}
        {!isOn && (
          <div
            className="absolute inset-0 rounded-full flex items-center justify-center"
            style={{ backgroundColor: "rgba(10, 10, 14, 0.55)" }}
          >
            <UserX className="w-5 h-5" style={{ color: "var(--color-danger)" }} />
          </div>
        )}
      </div>
      <p className={`text-label truncate w-full text-center ${isOn ? "text-ink" : "text-ink-faint"}`}>
        {name}
      </p>
      {showOtBadge && <OvertimeBadge />}
      {showDayOffLabel && (
        <span
          className="text-micro font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap"
          style={{
            color: "var(--color-warning)",
            backgroundColor: "color-mix(in srgb, var(--color-warning) 16%, transparent)",
          }}
        >
          Día libre
        </span>
      )}
      {showExcludedLabel && (
        <span
          className="text-micro font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap"
          style={{
            color: "var(--color-danger)",
            backgroundColor: "color-mix(in srgb, var(--color-danger) 16%, transparent)",
          }}
        >
          Fuera
        </span>
      )}
    </button>
  );
}
