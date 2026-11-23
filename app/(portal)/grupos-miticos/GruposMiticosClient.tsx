"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Trophy, Plus, Archive, ArchiveRestore, Trash2, RefreshCw, Loader2, Pencil, Check, X as XIcon, ChevronLeft, ChevronRight } from "lucide-react";
import SectionToggle from "@/app/components/SectionToggle";
import IconAction from "@/app/components/IconAction";
import IconBadge from "@/app/components/dashboard/IconBadge";
import { useConfirm } from "@/app/components/ConfirmDialogProvider";
import { useToast } from "@/app/components/ToastProvider";
import { readJson } from "@/lib/read-json";
import { getLockoutWeekStart } from "@/lib/wow-reset";
import { cascadeStyle } from "@/lib/cascade";
import {
  GROUP_SIZE,
  buildLeaderboard,
  computeIndividualCounts,
  filterRunsByPeriod,
  type MythicPlusGroupRun,
  type MythicPlusPeriod,
} from "@/lib/mythic-plus-groups";
import PageHeader from "@/app/components/PageHeader";

interface GroupMember {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
}

interface Group {
  id: string;
  name: string;
  archivedAt: string | null;
  createdAt: string;
  members: GroupMember[];
  runs: MythicPlusGroupRun[];
}

interface MemberOption {
  id: string;
  discord_username: string;
  avatar_url: string | null;
}

const RUNS_PAGE_SIZE = 10;

function formatClock(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "—";
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatWeekRange(start: Date): string {
  const end = new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000);
  const fmt = (d: Date) => d.toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit" });
  return `${fmt(start)} – ${fmt(end)}`;
}

const AVATAR_COLORS = [
  "var(--color-primary)",
  "var(--color-secondary)",
  "var(--color-success)",
  "var(--color-danger)",
  "var(--color-warning)",
];
function avatarColorForUser(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function PersonAvatar({
  userId,
  name,
  avatarUrl,
  size = 40,
}: {
  userId: string;
  name: string;
  avatarUrl: string | null;
  size?: number;
}) {
  const color = avatarColorForUser(userId);
  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt=""
        width={size}
        height={size}
        className="rounded-full object-cover shrink-0"
        style={{ width: size, height: size, border: `2px solid ${color}` }}
      />
    );
  }
  return (
    <div
      className="rounded-full flex items-center justify-center font-heading font-bold shrink-0"
      style={{
        width: size,
        height: size,
        backgroundColor: `color-mix(in srgb, ${color} 22%, var(--color-surface))`,
        border: `2px solid ${color}`,
        color,
        fontSize: size * 0.4,
      }}
    >
      {name.slice(0, 1).toUpperCase()}
    </div>
  );
}

function PersonTile({
  userId,
  name,
  avatarUrl,
  size = 40,
  subtitle,
}: {
  userId: string;
  name: string;
  avatarUrl: string | null;
  size?: number;
  subtitle?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1" style={{ width: size + 24 }}>
      <PersonAvatar userId={userId} name={name} avatarUrl={avatarUrl} size={size} />
      <span className="text-label text-ink text-center w-full truncate" title={name}>
        {name}
      </span>
      {subtitle && <span className="text-micro text-ink-faint font-data">{subtitle}</span>}
    </div>
  );
}

function KeystonePips({ upgrades }: { upgrades: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" title={upgrades > 0 ? `Timed +${upgrades}` : "Depletada"}>
      {[1, 2, 3].map((i) => (
        <span
          key={i}
          className="rounded-full"
          style={{ width: 6, height: 6, backgroundColor: i <= upgrades ? "var(--color-primary)" : "var(--color-line)" }}
        />
      ))}
    </span>
  );
}

function AbsentSlot({ size = 22 }: { size?: number }) {
  return (
    <div
      className="rounded-full flex items-center justify-center shrink-0"
      style={{ width: size, height: size, backgroundColor: "var(--color-surface-2)", border: "1px solid var(--color-line)" }}
    >
      <XIcon style={{ width: size * 0.55, height: size * 0.55 }} className="text-ink-faint" />
    </div>
  );
}

function RunRow({ run, group }: { run: MythicPlusGroupRun; group: Group }) {
  const participantIds = new Set(run.roster.map((r) => r.userId));
  return (
    <div
      className="flex items-center gap-3 rounded-lg px-3 py-2"
      style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-line)" }}
    >
      <div className="flex items-center gap-1 shrink-0">
        {group.members.map((m) => {
          if (!participantIds.has(m.userId)) return <AbsentSlot key={m.userId} size={22} />;
          const entry = run.roster.find((r) => r.userId === m.userId);
          return (
            <PersonAvatar key={m.userId} userId={m.userId} name={entry?.displayName ?? m.displayName} avatarUrl={m.avatarUrl} size={22} />
          );
        })}
      </div>
      <span className="font-heading font-semibold text-sm text-ink flex-1 min-w-0" title={run.dungeonName ?? undefined}>
        {run.dungeonName ?? "Mazmorra"}
      </span>
      <span className="inline-flex items-center gap-1.5 font-data text-sm text-ink-faint shrink-0">
        +{run.keystoneLevel}
        <KeystonePips upgrades={run.keystoneUpgrades} />
      </span>
      <span className="font-data text-xs text-ink-faint shrink-0 w-12 text-right">{formatClock(run.clearTimeMs)}</span>
    </div>
  );
}

function RunRowFiller() {
  return (
    <div className="flex items-center gap-3 rounded-lg px-3 py-2 invisible" aria-hidden="true">
      <div className="flex items-center gap-1 shrink-0">
        {Array.from({ length: GROUP_SIZE }).map((_, i) => (
          <div key={i} style={{ width: 22, height: 22 }} />
        ))}
      </div>
      <span className="font-heading font-semibold text-sm flex-1">.</span>
      <span className="font-data text-sm shrink-0">+0</span>
      <span className="font-data text-xs shrink-0 w-12">00:00</span>
    </div>
  );
}

function fieldStyle(): React.CSSProperties {
  return { backgroundColor: "var(--color-surface)", border: "1px solid var(--color-line)", color: "var(--color-ink)" };
}

function PeriodToggle({ value, onChange }: { value: MythicPlusPeriod; onChange: (v: MythicPlusPeriod) => void }) {
  const options: { value: MythicPlusPeriod; label: string }[] = [
    { value: "day", label: "Día" },
    { value: "week", label: "Semana" },
  ];
  const activeIndex = options.findIndex((o) => o.value === value);
  return (
    <div
      role="radiogroup"
      aria-label="Período"
      className="relative inline-flex rounded-full p-1 gap-1"
      style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-line)" }}
    >
      <span
        aria-hidden
        className="absolute top-1 bottom-1 rounded-full transition-transform duration-200 ease-out"
        style={{
          width: "calc(50% - 4px)",
          left: 4,
          transform: `translateX(${activeIndex * 100}%)`,
          background: "linear-gradient(135deg, var(--color-primary), var(--color-primary-deep))",
          boxShadow: "0 2px 10px -2px rgba(255, 125, 10, 0.55)",
        }}
      />
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className="relative z-[1] rounded-full px-4 py-1.5 text-sm font-semibold transition-colors"
            style={{ color: active ? "white" : "var(--color-ink-faint)" }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function MemberSelectGrid({
  options,
  selectedIds,
  onChange,
  takenByUserId,
}: {
  options: MemberOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  takenByUserId: Map<string, string>;
}) {
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const atCap = selectedIds.length >= GROUP_SIZE;

  function toggle(id: string) {
    if (selectedSet.has(id)) {
      onChange(selectedIds.filter((i) => i !== id));
    } else if (!atCap && !takenByUserId.has(id)) {
      onChange([...selectedIds, id]);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <p className="text-xs text-ink-faint">Toca a los {GROUP_SIZE} integrantes del grupo.</p>
        <span className="font-data text-xs text-ink-faint whitespace-nowrap">
          {selectedIds.length} / {GROUP_SIZE} elegidos
        </span>
      </div>
      <div className="flex flex-wrap justify-center gap-3 max-h-80 overflow-y-auto py-1">
        {options.map((o) => {
          const isOn = selectedSet.has(o.id);
          const takenGroupName = takenByUserId.get(o.id);
          const color = avatarColorForUser(o.id);
          const disabled = !isOn && (atCap || !!takenGroupName);
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => toggle(o.id)}
              disabled={disabled}
              title={takenGroupName ? `Ya está en "${takenGroupName}"` : o.discord_username}
              className={`flex flex-col items-center gap-1 w-20 rounded-lg py-2 px-1 transition-all disabled:cursor-not-allowed ${
                takenGroupName ? "opacity-80" : disabled ? "opacity-40" : ""
              }`}
              style={{
                backgroundColor: isOn
                  ? `color-mix(in srgb, ${color} 12%, transparent)`
                  : takenGroupName
                    ? "color-mix(in srgb, var(--color-danger) 10%, transparent)"
                    : "transparent",
                border: isOn ? `1px solid ${color}` : takenGroupName ? "1px solid var(--color-danger)" : "1px solid transparent",
              }}
            >
              <div className="relative">
                {o.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={o.avatar_url}
                    alt=""
                    width={48}
                    height={48}
                    className="w-12 h-12 rounded-full object-cover"
                    style={!isOn ? { filter: "grayscale(1)", opacity: 0.7 } : undefined}
                  />
                ) : (
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center font-heading font-bold text-sm"
                    style={{
                      backgroundColor: isOn ? `color-mix(in srgb, ${color} 22%, transparent)` : "var(--color-surface-2)",
                      color: isOn ? color : "var(--color-ink-muted)",
                    }}
                  >
                    {o.discord_username.slice(0, 1).toUpperCase()}
                  </div>
                )}
                {isOn && (
                  <div
                    className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: color, border: "2px solid var(--color-surface)" }}
                  >
                    <Check className="w-3 h-3" style={{ color: "white" }} />
                  </div>
                )}
              </div>
              <p
                className="text-label truncate w-full text-center"
                style={{ color: isOn ? "var(--color-ink)" : takenGroupName ? "var(--color-danger)" : "var(--color-ink-faint)" }}
              >
                {takenGroupName ? "En Grupo" : o.discord_username}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function GruposMiticosClient({ canManage, myUserId }: { canManage: boolean; myUserId: string | null }) {
  const confirm = useConfirm();
  const toast = useToast();
  const [groups, setGroups] = useState<Group[]>([]);
  const [memberOptions, setMemberOptions] = useState<MemberOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<MythicPlusPeriod>("week");

  const [viewMode, setViewMode] = useState<"personal" | "admin">("personal");

  const [createOpen, setCreateOpen] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [groupName, setGroupName] = useState("");
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [runPageByGroup, setRunPageByGroup] = useState<Record<string, number>>({});

  const [importBusy, setImportBusy] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const requests: Promise<void>[] = [
      fetch("/api/admin/mythic-plus-groups")
        .then(readJson<{ groups: Group[] }>)
        .then((data) => {
          if (data) setGroups(data.groups);
        }),
    ];
    if (canManage) {
      requests.push(
        fetch("/api/members")
          .then(readJson<{ members: MemberOption[] }>)
          .then((data) => {
            if (data) setMemberOptions(data.members);
          })
      );
    }
    await Promise.all(requests);
    setLoading(false);
  }, [canManage]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const activeGroups = useMemo(() => groups.filter((g) => !g.archivedAt), [groups]);
  const archivedGroups = useMemo(() => groups.filter((g) => g.archivedAt), [groups]);

  const runsByGroup = useMemo(() => {
    const map = new Map<string, MythicPlusGroupRun[]>();
    for (const g of groups) map.set(g.id, filterRunsByPeriod(g.runs, period));
    return map;
  }, [groups, period]);

  const leaderboard = useMemo(() => buildLeaderboard(activeGroups.map((g) => g.id), runsByGroup), [activeGroups, runsByGroup]);
  const leaderboardByGroup = useMemo(() => new Map(leaderboard.map((e) => [e.groupId, e])), [leaderboard]);

  const myGroup = useMemo(
    () => (myUserId ? (activeGroups.find((g) => g.members.some((m) => m.userId === myUserId)) ?? null) : null),
    [activeGroups, myUserId]
  );

  const takenByUserId = useMemo(() => {
    const map = new Map<string, string>();
    for (const g of activeGroups) {
      if (g.id === editingGroupId) continue;
      for (const m of g.members) map.set(m.userId, g.name);
    }
    return map;
  }, [activeGroups, editingGroupId]);

  const currentWeekStart = useMemo(() => getLockoutWeekStart("us"), []);

  function resetForm() {
    setGroupName("");
    setSelectedUserIds([]);
    setFormError(null);
    setEditingGroupId(null);
  }

  function startEdit(group: Group) {
    setEditingGroupId(group.id);
    setGroupName(group.name);
    setSelectedUserIds(group.members.map((m) => m.userId));
    setFormError(null);
    setCreateOpen(true);
  }

  async function handleSave() {
    if (!groupName.trim()) {
      setFormError("Falta el nombre del grupo");
      return;
    }
    if (selectedUserIds.length !== GROUP_SIZE) {
      setFormError(`Elige exactamente ${GROUP_SIZE} integrantes (llevas ${selectedUserIds.length})`);
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const res = editingGroupId
        ? await fetch(`/api/admin/mythic-plus-groups/${editingGroupId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: groupName.trim(), userIds: selectedUserIds }),
          })
        : await fetch("/api/admin/mythic-plus-groups", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: groupName.trim(), userIds: selectedUserIds }),
          });
      const data = await readJson<{ error?: string }>(res);
      if (!res.ok) {
        setFormError(data?.error ?? "No se pudo guardar el grupo");
        return;
      }
      toast.success(editingGroupId ? "Grupo actualizado" : "Grupo creado");
      resetForm();
      setCreateOpen(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function handleArchive(group: Group) {
    const archiving = !group.archivedAt;
    if (archiving) {
      const confirmed = await confirm(
        `¿Archivar el grupo "${group.name}"? Deja de contar en el leaderboard, no se borra su historial.`,
        { title: "Archivar grupo", confirmLabel: "Archivar" }
      );
      if (!confirmed) return;
    }
    const res = await fetch(`/api/admin/mythic-plus-groups/${group.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived: archiving }),
    });
    if (res.ok) {
      await load();
      toast.success(archiving ? "Grupo archivado" : "Grupo restaurado");
    } else {
      toast.error(archiving ? "No se pudo archivar el grupo" : "No se pudo restaurar el grupo");
    }
  }

  async function handleDelete(group: Group) {
    const confirmed = await confirm(
      `¿Eliminar el grupo "${group.name}" para siempre? Se borran también sus ${group.runs.length} mítica(s) registrada(s). Esta acción no se puede deshacer.`,
      { title: "Eliminar grupo", confirmLabel: "Eliminar", danger: true }
    );
    if (!confirmed) return;
    const res = await fetch(`/api/admin/mythic-plus-groups/${group.id}`, { method: "DELETE" });
    if (res.ok) {
      await load();
      toast.success("Grupo eliminado");
    } else {
      toast.error("No se pudo eliminar el grupo");
    }
  }

  async function handleUpdate() {
    setImportBusy(true);
    setImportMessage(null);
    try {
      const res = await fetch("/api/admin/mythic-plus-groups/import-wcl", { method: "POST" });
      const data = await readJson<{ imported?: number; error?: string }>(res);
      if (!res.ok) {
        setImportMessage(data?.error ?? "No se pudo actualizar desde Warcraft Logs");
        toast.error("No se pudo actualizar desde Warcraft Logs", data?.error);
        return;
      }
      const imported = data?.imported ?? 0;
      setImportMessage(`Se importaron ${imported} míticas nuevas.`);
      if (imported > 0) toast.success(`${imported} míticas nuevas importadas`);
      else toast.info("Sin míticas nuevas", "Warcraft Logs no tiene runs nuevas de esta semana.");
      await load();
    } finally {
      setImportBusy(false);
    }
  }

  function pageFor(groupId: string): number {
    return runPageByGroup[groupId] ?? 0;
  }
  function setPage(groupId: string, page: number) {
    setRunPageByGroup((prev) => ({ ...prev, [groupId]: page }));
  }

  if (loading) {
    return (
      <div className="portal-container flex items-center gap-2 text-ink-faint py-10">
        <Loader2 className="w-4 h-4 animate-spin" />
        Cargando grupos M+...
      </div>
    );
  }

  return (
    <div className={`portal-container ${viewMode === "admin" ? "is-wide" : ""}`}>
      <div className="space-y-8">
        <PageHeader
          eyebrow="Raid"
          icon={Trophy}
          title="Grupos M+"
          description="Uno de los miembros del grupo debe subir a la guild logs de las míticas para actualizar esta información."
          actions={
          <div className="flex items-center gap-3">
            <PeriodToggle value={period} onChange={setPeriod} />
            {canManage && (
              <button type="button" onClick={() => setViewMode((v) => (v === "admin" ? "personal" : "admin"))} className="btn btn-secondary">
                {viewMode === "admin" ? "Mi vista" : "Administrar"}
              </button>
            )}
          </div>
          }
        />

        {viewMode === "admin" ? (
          <>
            <div className="card p-4">
              <SectionToggle
                icon={Plus}
                title={editingGroupId ? "Editar grupo" : "Crear grupo"}
                hint={`Elige ${GROUP_SIZE} integrantes`}
                open={createOpen}
                onToggle={() => {
                  if (createOpen) resetForm();
                  setCreateOpen((v) => !v);
                }}
              />
              {createOpen && (
                <div className="mt-4 space-y-4">
                  <input
                    type="text"
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    placeholder="Nombre del grupo"
                    className="w-full rounded-xl px-3 py-2.5 text-sm"
                    style={fieldStyle()}
                  />
                  <MemberSelectGrid
                    options={memberOptions}
                    selectedIds={selectedUserIds}
                    onChange={setSelectedUserIds}
                    takenByUserId={takenByUserId}
                  />
                  {formError && (
                    <p className="text-xs" style={{ color: "var(--color-danger)" }}>
                      {formError}
                    </p>
                  )}
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => {
                        resetForm();
                        setCreateOpen(false);
                      }}
                    >
                      Cancelar
                    </button>
                    <button type="button" className="btn btn-primary" disabled={saving} onClick={handleSave}>
                      {saving ? "Guardando..." : editingGroupId ? "Guardar cambios" : "Crear grupo"}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between flex-wrap gap-3 -mt-2">
              <p className="text-xs text-ink-faint">Semana de reset en curso: {formatWeekRange(currentWeekStart)}</p>
              <div className="flex items-center gap-3">
                {importMessage && <p className="text-xs text-ink-faint">{importMessage}</p>}
                <button
                  type="button"
                  onClick={handleUpdate}
                  disabled={importBusy}
                  className="flex items-center gap-1.5 text-xs text-ink-faint hover:text-ink transition-colors disabled:opacity-60"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${importBusy ? "animate-spin" : ""}`} />
                  {importBusy ? "Actualizando..." : "Actualizar"}
                </button>
              </div>
            </div>

            <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(420px, 1fr))" }}>
              {[...activeGroups, ...archivedGroups].map((group, index) => {
                const entry = leaderboardByGroup.get(group.id);
                const groupRuns = runsByGroup.get(group.id) ?? [];
                const totalPages = Math.max(1, Math.ceil(groupRuns.length / RUNS_PAGE_SIZE));
                const page = Math.min(pageFor(group.id), totalPages - 1);
                const visibleRuns = groupRuns.slice(page * RUNS_PAGE_SIZE, page * RUNS_PAGE_SIZE + RUNS_PAGE_SIZE);
                const individualCounts = computeIndividualCounts(
                  group.members.map((m) => m.userId),
                  groupRuns
                );
                return (
                  <div
                    key={group.id}
                    className="card p-4 cascade-item"
                    style={
                      {
                        "--card-glow": avatarColorForUser(group.members[0]?.userId ?? group.id),
                        ...cascadeStyle(index),
                        opacity: group.archivedAt ? 0.55 : 1,
                      } as React.CSSProperties
                    }
                  >
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="min-w-0">
                        <h3 className="font-heading font-bold text-lg text-ink truncate">{group.name}</h3>
                        <p className="text-xs text-ink-faint">
                          <span className="font-data font-bold text-ink">{entry?.confirmedCount ?? 0}</span> confirmadas
                          {entry && entry.partialCount > 0 ? ` · ${entry.partialCount} parciales` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <IconAction icon={Pencil} label="Editar" onClick={() => startEdit(group)} />
                        <IconAction
                          icon={group.archivedAt ? ArchiveRestore : Archive}
                          label={group.archivedAt ? "Reactivar" : "Archivar"}
                          onClick={() => handleArchive(group)}
                        />
                        <IconAction
                          icon={Trash2}
                          label="Eliminar"
                          className="hover:text-[color:var(--color-danger)]"
                          onClick={() => handleDelete(group)}
                        />
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-3 mb-4 pb-4 border-b" style={{ borderColor: "var(--color-line)" }}>
                      {group.members.map((m) => (
                        <PersonTile
                          key={m.userId}
                          userId={m.userId}
                          name={m.displayName}
                          avatarUrl={m.avatarUrl}
                          size={32}
                          subtitle={String(individualCounts.get(m.userId) ?? 0)}
                        />
                      ))}
                    </div>
                    <div className="space-y-1.5">
                      {groupRuns.length === 0 && <p className="text-xs text-ink-faint">Sin míticas registradas.</p>}
                      {visibleRuns.map((run) => (
                        <RunRow key={run.id} run={run} group={group} />
                      ))}
                      {totalPages > 1 &&
                        Array.from({ length: RUNS_PAGE_SIZE - visibleRuns.length }).map((_, i) => <RunRowFiller key={`filler-${i}`} />)}
                    </div>
                    {totalPages > 1 && (
                      <div className="flex items-center justify-center gap-2 mt-3 pt-3 border-t" style={{ borderColor: "var(--color-line)" }}>
                        <IconAction
                          icon={ChevronLeft}
                          label="Página anterior"
                          disabled={page === 0}
                          onClick={() => setPage(group.id, Math.max(0, page - 1))}
                        />
                        <span className="font-data text-xs text-ink-faint w-14 text-center">
                          {page + 1} / {totalPages}
                        </span>
                        <IconAction
                          icon={ChevronRight}
                          label="Página siguiente"
                          disabled={page >= totalPages - 1}
                          onClick={() => setPage(group.id, Math.min(totalPages - 1, page + 1))}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
              {groups.length === 0 && <p className="text-ink-faint text-sm">Todavía no hay grupos creados.</p>}
            </div>
          </>
        ) : (
          <div className="space-y-6">
            {myGroup &&
              (() => {
                const entry = leaderboardByGroup.get(myGroup.id);
                const groupRuns = runsByGroup.get(myGroup.id) ?? [];
                const individualCounts = computeIndividualCounts(
                  myGroup.members.map((m) => m.userId),
                  groupRuns
                );
                return (
                  <div className="card p-4" style={{ borderLeft: `4px solid ${avatarColorForUser(myGroup.members[0]?.userId ?? myGroup.id)}` }}>
                    <p className="text-xs uppercase tracking-wide font-semibold text-ink-faint mb-2">Tu grupo</p>
                    <h2 className="font-heading font-bold text-lg text-ink mb-3">{myGroup.name}</h2>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                      <div className="card p-3">
                        <IconBadge icon={Trophy} color="var(--color-primary)" size="sm" />
                        <p className="font-data text-xl font-bold text-ink mt-1">{entry?.confirmedCount ?? 0}</p>
                        <p className="text-micro text-ink-faint uppercase">Confirmadas</p>
                      </div>
                      <div className="card p-3">
                        <p className="font-data text-xl font-bold text-ink mt-1">
                          {entry?.avgKeystoneLevel != null ? `+${Math.round(entry.avgKeystoneLevel)}` : "—"}
                        </p>
                        <p className="text-micro text-ink-faint uppercase">Nivel prom.</p>
                      </div>
                      <div className="card p-3">
                        <p className="font-data text-xl font-bold text-ink mt-1">{formatClock(entry?.avgClearTimeMs)}</p>
                        <p className="text-micro text-ink-faint uppercase">Tiempo prom.</p>
                      </div>
                      <div className="card p-3">
                        <p className="font-data text-xl font-bold text-ink mt-1">
                          {entry?.avgIlvl != null ? Math.round(entry.avgIlvl) : "—"}
                        </p>
                        <p className="text-micro text-ink-faint uppercase">Ilvl prom.</p>
                      </div>
                    </div>
                    <p className="text-xs uppercase tracking-wide font-semibold text-ink-faint mb-2">Por integrante</p>
                    <div className="flex flex-wrap gap-3">
                      {myGroup.members.map((m) => (
                        <PersonTile
                          key={m.userId}
                          userId={m.userId}
                          name={m.displayName}
                          avatarUrl={m.avatarUrl}
                          size={40}
                          subtitle={String(individualCounts.get(m.userId) ?? 0)}
                        />
                      ))}
                    </div>
                  </div>
                );
              })()}

            <div>
              <p className="text-xs uppercase tracking-wide font-semibold text-ink-faint mb-2">Leaderboard</p>
              <div className="space-y-3">
                {leaderboard.map((entry, index) => {
                  const group = activeGroups.find((g) => g.id === entry.groupId);
                  if (!group) return null;
                  return (
                    <div key={entry.groupId} className="card p-3 cascade-item flex items-center gap-3" style={cascadeStyle(index)}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-3">
                          <span className="font-data font-bold text-ink-faint w-6 text-center shrink-0">#{index + 1}</span>
                          <span className="font-heading font-semibold text-ink flex-1 min-w-0 truncate">{group.name}</span>
                        </div>
                        <div className="flex flex-wrap gap-3 mb-3">
                          {group.members.map((m) => (
                            <PersonTile key={m.userId} userId={m.userId} name={m.displayName} avatarUrl={m.avatarUrl} size={32} />
                          ))}
                        </div>
                        {entry.levelBreakdown.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {entry.levelBreakdown.map((b) => (
                              <span
                                key={b.label}
                                className="text-micro font-data font-semibold px-1.5 py-0.5 rounded-full"
                                style={{
                                  backgroundColor: "color-mix(in srgb, var(--color-primary) 14%, transparent)",
                                  color: "var(--color-primary)",
                                }}
                              >
                                {b.label} ×{b.count}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div
                        className="flex flex-col items-center justify-center rounded-lg shrink-0 self-center"
                        style={{ minWidth: 56, padding: "4px 10px", backgroundColor: "color-mix(in srgb, var(--color-primary) 12%, transparent)" }}
                      >
                        <span className="font-data font-bold text-lg text-ink leading-none">{entry.confirmedCount}</span>
                        <span className="text-micro text-ink-faint uppercase tracking-wide leading-none mt-0.5">confirmadas</span>
                      </div>
                    </div>
                  );
                })}
                {leaderboard.length === 0 && <p className="text-ink-faint text-sm">Todavía no hay grupos con míticas registradas.</p>}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
