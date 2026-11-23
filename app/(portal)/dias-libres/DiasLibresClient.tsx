"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeftRight,
  CalendarCheck,
  CalendarOff,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { formatDayLabel } from "@/lib/format";
import { useRefetchOnReturn } from "@/lib/useRefetchOnReturn";
import { cascadeStyle } from "@/lib/cascade";
import { getGuildToday } from "@/lib/guild-day";
import DateField from "../../components/DateField";
import IconBadge from "../../components/dashboard/IconBadge";
import IntercambiosView from "./IntercambiosView";
import AprobacionesView from "./AprobacionesView";
import CalendarioView from "./CalendarioView";
import { SwapRequestDTO } from "./SwapExchangeCard";
import PageHeader from "@/app/components/PageHeader";
import { readJsonBody } from "@/lib/read-json";
import LoadingState from "@/app/components/LoadingState";
import { useToast } from "@/app/components/ToastProvider";

interface DayOffEntry {
  id: string;
  date: string;
  lockedBySwap?: boolean;
}

interface MemberDaysOff {
  user_id: string;
  discord_username: string;
  daysOff: DayOffEntry[];
  dominantRoles?: string[];
}

type TabKey = "mis-dias" | "intercambios" | "aprobaciones" | "guild";

interface TabDef {
  key: TabKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  managerOnly: boolean;
}

const TABS: TabDef[] = [
  { key: "mis-dias", label: "Mis días libres", icon: CalendarOff, managerOnly: false },
  { key: "intercambios", label: "Intercambios", icon: ArrowLeftRight, managerOnly: false },
  { key: "aprobaciones", label: "Aprobaciones", icon: ShieldCheck, managerOnly: true },
  { key: "guild", label: "Guild", icon: Users, managerOnly: true },
];

const TAB_SUBTITLE: Record<TabKey, string> = {
  "mis-dias": "Tus días libres programados",
  intercambios: "Propón un cambio de día o responde el que te propusieron",
  aprobaciones: "Revisa y resuelve los intercambios que acordaron los miembros",
  guild: "Programa y quita días libres de cualquier miembro",
};

function panelToTab(panel: string | undefined): TabKey {
  return TABS.some((t) => t.key === panel) ? (panel as TabKey) : "mis-dias";
}

export default function DiasLibresClient({
  initialMemberId,
  initialPanel,
}: {
  initialMemberId?: string;
  initialPanel?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState<TabKey>(() => panelToTab(initialPanel));
  const [canSeeAll, setCanSeeAll] = useState(false);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [myDaysOff, setMyDaysOff] = useState<DayOffEntry[]>([]);
  const [members, setMembers] = useState<MemberDaysOff[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [memberSearch, setMemberSearch] = useState("");
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(initialMemberId ?? null);
  const [adding, setAdding] = useState(false);

  const [offerId, setOfferId] = useState<string | null>(null);
  const [swapSent, setSwapSent] = useState<SwapRequestDTO[]>([]);
  const [swapReceived, setSwapReceived] = useState<SwapRequestDTO[]>([]);
  const [swapBusyId, setSwapBusyId] = useState<string | null>(null);
  const [swapError, setSwapError] = useState("");
  const [awaitingApprovalCount, setAwaitingApprovalCount] = useState(0);

  function selectMember(id: string) {
    setSelectedMemberId(id);
    router.replace(`/dias-libres?member=${id}`, { scroll: false });
  }

  async function loadMine() {
    const res = await fetch("/api/days-off");
    const data = await readJsonBody(res);
    if (!res.ok) {
      setError(data.error || "No se pudieron cargar tus días libres.");
      return false;
    }
    setCanSeeAll(!!data.canSeeAll);
    setViewerId(data.userId ?? null);
    setMyDaysOff(data.daysOff ?? []);
    return !!data.canSeeAll;
  }

  async function loadAll() {
    const res = await fetch("/api/days-off?all=true");
    const data = await readJsonBody(res);
    if (!res.ok) {
      setError(data.error || "No se pudo cargar el guild.");
      return;
    }
    setMembers(data.members ?? []);
  }

  async function loadSwaps() {
    const res = await fetch("/api/days-off/swap-requests");
    const data = await readJsonBody(res);
    if (!res.ok) return;
    setSwapSent(data.sent ?? []);
    setSwapReceived(data.received ?? []);
    setAwaitingApprovalCount(data.awaitingApprovalCount ?? 0);
  }

  useRefetchOnReturn(() => {
    (async () => {
      setLoading(true);
      setError("");
      await Promise.all([loadMine(), loadAll(), loadSwaps()]);
      setLoading(false);
    })();
  });

  function openSwapFor(availabilityId: string) {
    setOfferId(availabilityId);
    setTab("intercambios");
  }

  async function handleAddDayOff(userId: string, date: string): Promise<boolean> {
    setAdding(true);
    try {
      const res = await fetch("/api/days-off", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, date }),
      });
      const data = await readJsonBody(res);
      if (!res.ok) {
        setError(data.error || "No se pudo programar el día libre.");
        toast.error("No se pudo programar el día libre", data.error || undefined);
        return false;
      }
      setMembers((prev) =>
        prev.map((m) =>
          m.user_id === userId
            ? {
                ...m,
                daysOff: [...m.daysOff.filter((d) => d.date !== date), data.dayOff].sort((a, b) =>
                  a.date.localeCompare(b.date)
                ),
              }
            : m
        )
      );
      await loadMine();
      return true;
    } finally {
      setAdding(false);
    }
  }

  async function handleRemoveDayOff(userId: string, id: string) {
    const res = await fetch(`/api/days-off/${id}`, { method: "DELETE" });
    const data = await readJsonBody(res).catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "No se pudo quitar el día libre.");
      toast.error("No se pudo quitar el día libre", data.error || undefined);
      return;
    }
    setMembers((prev) =>
      prev.map((m) =>
        m.user_id === userId ? { ...m, daysOff: m.daysOff.filter((d) => d.id !== id) } : m
      )
    );
    await loadMine();
    toast.success("Día libre quitado");
  }

  async function handleCreateSwap(
    myAvailabilityId: string,
    theirAvailabilityId: string,
    message: string
  ): Promise<string | null> {
    const res = await fetch("/api/days-off/swap-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ myAvailabilityId, theirAvailabilityId, message: message || undefined }),
    });
    const data = await readJsonBody(res);
    if (!res.ok) return data.error || "No se pudo enviar la solicitud.";
    setOfferId(null);
    await loadSwaps();
    return null;
  }

  async function respondToSwap(id: string, action: "accept" | "reject" | "cancel") {
    setSwapBusyId(id);
    setSwapError("");
    try {
      const res = await fetch(`/api/days-off/swap-requests/${id}/${action}`, { method: "PATCH" });
      const data = await readJsonBody(res);
      if (!res.ok) {
        setSwapError(data.error || "No se pudo actualizar la solicitud.");
        return;
      }
      await loadSwaps();
    } finally {
      setSwapBusyId(null);
    }
  }

  if (loading) return <LoadingState count={6} />;

  const visibleTabs = TABS.filter((t) => !t.managerOnly || canSeeAll);
  const activeTab = visibleTabs.some((t) => t.key === tab) ? tab : "mis-dias";
  const pendingReceivedCount = swapReceived.filter((r) => r.status === "pending").length;

  const badges: Partial<Record<TabKey, number>> = {
    intercambios: pendingReceivedCount,
    aprobaciones: awaitingApprovalCount,
  };

  return (
    <div>
      <PageHeader
        eyebrow="Raid"
        icon={CalendarOff}
        title="Días Libres"
        description={TAB_SUBTITLE[activeTab]}
      />

      <div className="nav-tray w-fit mb-6 flex-wrap">
        {visibleTabs.map((t) => {
          const Icon = t.icon;
          const count = badges[t.key] ?? 0;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`nav-slot${activeTab === t.key ? " nav-slot-active" : ""}`}
            >
              <Icon className="w-4 h-4" />
              <span>{t.label}</span>
              {count > 0 && (
                <span
                  className="min-w-[17px] h-[17px] px-1 rounded-full text-micro font-bold flex items-center justify-center text-white"
                  style={{ backgroundColor: "var(--color-danger)" }}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

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

      {activeTab === "mis-dias" && <PersonalView daysOff={myDaysOff} onOfferSwap={openSwapFor} />}

      {activeTab === "intercambios" && (
        <IntercambiosView
          myDaysOff={myDaysOff}
          viewerId={viewerId}
          offerId={offerId}
          onOfferIdChange={setOfferId}
          sent={swapSent}
          received={swapReceived}
          busyId={swapBusyId}
          error={swapError}
          onCreate={handleCreateSwap}
          onAccept={(id) => respondToSwap(id, "accept")}
          onReject={(id) => respondToSwap(id, "reject")}
          onCancel={(id) => respondToSwap(id, "cancel")}
        />
      )}

      {activeTab === "aprobaciones" && (
        <AprobacionesView
          onResolved={async () => {
            await loadMine();
            await loadSwaps();
          }}
        />
      )}

      {activeTab === "guild" && (
        <GuildView
          members={members}
          memberSearch={memberSearch}
          setMemberSearch={setMemberSearch}
          selectedMemberId={selectedMemberId}
          setSelectedMemberId={selectMember}
          onAdd={handleAddDayOff}
          onRemove={handleRemoveDayOff}
          adding={adding}
        />
      )}
    </div>
  );
}

function StatTile({
  icon,
  color,
  label,
  value,
  onClick,
  hint,
}: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  color: string;
  label: string;
  value: string | number;
  onClick?: () => void;
  hint?: string;
}) {
  const inner = (
    <>
      <IconBadge icon={icon} color={color} />
      <div className="min-w-0 text-left">
        <p className="text-ink-muted text-xs uppercase tracking-wide font-semibold truncate">{label}</p>
        <p className="font-data text-2xl font-bold text-ink">{value}</p>
        {hint && (
          <p className="text-micro font-semibold" style={{ color }}>
            {hint}
          </p>
        )}
      </div>
    </>
  );

  if (!onClick) {
    return <div className="card p-4 flex items-center gap-3">{inner}</div>;
  }

  return (
    <button type="button" onClick={onClick} className="card card-hover p-4 flex items-center gap-3 w-full">
      {inner}
    </button>
  );
}

function PersonalView({
  daysOff,
  onOfferSwap,
}: {
  daysOff: DayOffEntry[];
  onOfferSwap: (availabilityId: string) => void;
}) {
  const today = getGuildToday();

  if (daysOff.length === 0) {
    return (
      <div className="card px-6 py-14 text-center">
        <CalendarOff className="w-8 h-8 mx-auto mb-3" style={{ color: "var(--color-ink-faint)" }} />
        <p className="text-ink-muted text-sm">No tienes días libres programados.</p>
        <p className="text-ink-faint text-xs mt-1">
          Los asigna un RL desde la vista del guild. Cuando tengas uno, puedes proponer un
          intercambio desde acá.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
      {daysOff.map((d, index) => (
        <div
          key={d.id}
          className="card card-hover p-4 flex items-center gap-3 cascade-item"
          style={cascadeStyle(index)}
        >
          <IconBadge icon={CalendarOff} color="var(--color-success)" />
          <div className="min-w-0 flex-1">
            <p className="font-data text-sm font-semibold text-ink truncate">
              {formatDayLabel(d.date)}
            </p>
            <p className="text-ink-faint text-label">
              {d.date < today
                ? "Ya pasó"
                : d.lockedBySwap
                  ? "En un intercambio en curso"
                  : "Programado"}
            </p>
          </div>
          {d.date >= today && !d.lockedBySwap && (
            <button
              type="button"
              onClick={() => onOfferSwap(d.id)}
              title="Proponer un intercambio con este día"
              className="w-8 h-8 rounded-full flex items-center justify-center text-ink-faint hover:text-[color:var(--color-primary)] hover:bg-[color:var(--color-surface-2)] transition-colors shrink-0"
            >
              <ArrowLeftRight className="w-4 h-4" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function GuildView({
  members,
  memberSearch,
  setMemberSearch,
  selectedMemberId,
  setSelectedMemberId,
  onAdd,
  onRemove,
  adding,
}: {
  members: MemberDaysOff[];
  memberSearch: string;
  setMemberSearch: (v: string) => void;
  selectedMemberId: string | null;
  setSelectedMemberId: (v: string) => void;
  onAdd: (userId: string, date: string) => Promise<boolean>;
  onRemove: (userId: string, id: string) => void;
  adding: boolean;
}) {
  const [dateInput, setDateInput] = useState("");
  const [layout, setLayout] = useState<"por-miembro" | "calendario">("por-miembro");

  const filteredMembers = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => m.discord_username.toLowerCase().includes(q));
  }, [members, memberSearch]);

  useEffect(() => {
    if (filteredMembers.length === 0) return;
    if (!selectedMemberId || !filteredMembers.some((m) => m.user_id === selectedMemberId)) {
      setSelectedMemberId(filteredMembers[0].user_id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredMembers]);

  const stats = useMemo(() => {
    const withAny = members.filter((m) => m.daysOff.length > 0).length;
    const total = members.reduce((sum, m) => sum + m.daysOff.length, 0);
    return { members: members.length, withAny, total };
  }, [members]);

  const selectedGroup = filteredMembers.find((m) => m.user_id === selectedMemberId) ?? null;

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
        <StatTile icon={Users} color="var(--color-secondary)" label="Miembros" value={stats.members} />
        <StatTile
          icon={CalendarCheck}
          color="var(--color-success)"
          label="Con día libre"
          value={stats.withAny}
        />
        <StatTile
          icon={CalendarOff}
          color="var(--color-primary)"
          label="Días programados"
          value={stats.total}
          hint={layout === "calendario" ? "Ver por miembro →" : "Ver calendario →"}
          onClick={() => setLayout((v) => (v === "calendario" ? "por-miembro" : "calendario"))}
        />
      </div>

      {layout === "calendario" && (
        <CalendarioView members={members} onAdd={onAdd} onRemove={onRemove} />
      )}

      {layout === "por-miembro" && (
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-5">
        <div className="card p-4 h-fit">
          <input
            value={memberSearch}
            onChange={(e) => setMemberSearch(e.target.value)}
            placeholder="Buscar miembro..."
            className="input w-full px-3 py-2 text-sm mb-3"
          />
          <div className="space-y-1 max-h-[540px] overflow-y-auto pr-1">
            {filteredMembers.map((m) => {
              const isSelected = m.user_id === selectedMemberId;
              return (
                <button
                  key={m.user_id}
                  type="button"
                  onClick={() => setSelectedMemberId(m.user_id)}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm transition-colors"
                  style={
                    isSelected
                      ? {
                          backgroundColor: "var(--color-surface-2)",
                          border: "1px solid var(--color-line-strong)",
                          color: "var(--color-ink)",
                        }
                      : { border: "1px solid transparent", color: "var(--color-ink-muted)" }
                  }
                >
                  <span className="truncate">{m.discord_username}</span>
                  {m.daysOff.length > 0 && (
                    <span
                      className="font-data text-xs font-semibold shrink-0 ml-2"
                      style={{ color: "var(--color-primary)" }}
                    >
                      {m.daysOff.length}
                    </span>
                  )}
                </button>
              );
            })}
            {filteredMembers.length === 0 && (
              <p className="text-ink-faint text-xs text-center py-6">Sin resultados.</p>
            )}
          </div>
        </div>

        <div className="card p-5">
          {selectedGroup ? (
            <>
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-heading text-lg font-bold text-ink">
                  {selectedGroup.discord_username}
                </h2>
                <span className="text-xs text-ink-faint">
                  {selectedGroup.daysOff.length} día
                  {selectedGroup.daysOff.length === 1 ? "" : "s"} libre
                  {selectedGroup.daysOff.length === 1 ? "" : "s"}
                </span>
              </div>

              <div className="flex flex-wrap items-end gap-3 mb-5 pb-5 border-b border-line">
                <div>
                  <label className="block text-xs text-ink-muted mb-1.5 font-medium">
                    Agregar día libre
                  </label>
                  <DateField value={dateInput} onChange={setDateInput} mode="date" className="w-44" />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (!dateInput) return;
                    onAdd(selectedGroup.user_id, dateInput);
                    setDateInput("");
                  }}
                  disabled={!dateInput || adding}
                  className="btn btn-primary"
                >
                  {adding ? "Agregando..." : "Agregar"}
                </button>
              </div>

              {selectedGroup.daysOff.length === 0 ? (
                <div className="px-4 py-10 text-center text-ink-faint text-sm">
                  {selectedGroup.discord_username} no tiene días libres programados.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {selectedGroup.daysOff.map((d, index) => (
                    <div
                      key={d.id}
                      className="card card-hover p-4 flex items-center justify-between gap-3 cascade-item"
                      style={cascadeStyle(index)}
                    >
                      <span className="font-data text-sm font-medium text-ink truncate">
                        {formatDayLabel(d.date)}
                      </span>
                      <button
                        type="button"
                        onClick={() => onRemove(selectedGroup.user_id, d.id)}
                        title="Quitar día libre"
                        className="text-ink-faint hover:text-[color:var(--color-danger)] px-1 transition-colors shrink-0"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <p className="text-ink-faint text-sm text-center py-16">
              Elige un miembro de la lista para gestionar sus días libres.
            </p>
          )}
        </div>
      </div>
      )}
    </div>
  );
}
