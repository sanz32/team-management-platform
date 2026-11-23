"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  X,
  CheckCircle2,
  Star,
  Users,
  Wand2,
  ChevronDown,
  Gauge,
  Megaphone,
  Pencil,
  Plus,
  Trash2,
  Backpack,
  Shuffle,
} from "lucide-react";
import { capitalize } from "@/lib/format";
import { classColor, classGlow, classShort, shortSpec } from "@/lib/wow-classes";
import { DIFFICULTIES, type RaidKey, type RaidDef, type Difficulty } from "@/lib/raids";
import { formatRosterTitle, contentRaidLabel, RosterContentSummary } from "@/lib/roster-title";
import { useRefetchOnReturn } from "@/lib/useRefetchOnReturn";
import { DEFAULT_ROSTER_ILVL, RaidDifficulty } from "@/lib/roster-ilvl-defaults";
import {
  DEFAULT_RAID_SCHEDULE,
  RAID_SCHEDULE_TIMEZONE,
  type RaidScheduleSlot,
} from "@/lib/raid-schedule-defaults";
import { zonedDateKey, zonedTimeToUtc } from "@/lib/timezone";
import {
  requiresVoidspireMythicMonkHeal,
  hasMonkHeal,
  VOIDSPIRE_MYTHIC_MONK_HEAL_ERROR,
} from "@/lib/roster-rules";
import { cascadeStyle } from "@/lib/cascade";
import type { RosterDiagnostics, RoleRequest } from "@/lib/roster-generator";
import AutoDiagnosticsPanel from "./AutoDiagnosticsPanel";
import RoleIcon from "../../components/RoleIcon";
import { useConfirm } from "../../components/ConfirmDialogProvider";
import { useToast } from "@/app/components/ToastProvider";
import DateField from "../../components/DateField";
import IconBadge from "../../components/dashboard/IconBadge";
import PillToggle from "../../components/PillToggle";
import SectionToggle from "../../components/SectionToggle";
import SegmentedToggle from "../../components/SegmentedToggle";
import OvertimeBadge from "../../components/OvertimeBadge";
import MemberInclusionGrid from "./MemberInclusionGrid";
import EmptyState from "../../components/EmptyState";
import IconAction from "../../components/IconAction";
import PageHeader from "@/app/components/PageHeader";
import AdminIlvlSettingsPanel from "./AdminIlvlSettingsPanel";
import { readJsonBody } from "@/lib/read-json";

const ROSTER_CLASSES = [
  "Shaman",
  "Warrior",
  "Druid",
  "Monk",
  "Priest",
  "Demon Hunter",
  "Death Knight",
  "Mage",
  "Warlock",
];

const CLASS_CHIP_LABEL: Record<string, string> = {
  "Demon Hunter": "DH",
  "Death Knight": "DK",
};

type RoleKey = "tank" | "heal" | "dps";

interface ClassRequirement {
  class: string;
  min: number;
  max: number | null;
}

interface RoleConfig {
  count: string;
  minIlvlDifficulty: RaidDifficulty;
}

interface Candidate {
  id: string;
  user_id: string;
  name: string;
  realm_slug: string;
  region: string;
  ilvl: number;
  class: string | null;
  active_spec: string | null;
  discord_username: string;
  isOffSpec: boolean;
  specUsed: string | null;
  hasMochila: boolean;
  mochilaCount: number;
  isMainClass: boolean;
  isDayOff: boolean;
}

interface MochilaAssignee {
  userId: string;
  discordUsername: string;
  characterId: string;
  characterName: string;
}

interface SuggestedCandidate extends Candidate {
  isSaved: boolean | null;
}

interface UserSuggestion {
  user_id: string;
  discord_username: string;
  characters: SuggestedCandidate[];
}

interface RosterFeasibility {
  requested: number;
  maxFillable: number;
  byRole: { role: string; requested: number; fillable: number }[];
  singleRoleUsers: { role: string; usernames: string[] }[];
}

interface SelectedEntry {
  role: RoleKey;
  candidate: Candidate;
  isSaved: boolean | null;
}

interface SavedRoster {
  id: string;
  scheduledFor: string;
  targetAvgIlvl: number | null;
  content: RosterContentSummary | null;
  roles: RoleRequest[];
  selected: SelectedEntry[];
  averageIlvl: number;
  createdBy: string;
  mochilaRequestedCount: number | null;
  mochilaAssignees: MochilaAssignee[];
}

const ROLE_LABELS: Record<RoleKey, string> = {
  tank: "Tank",
  heal: "Heal",
  dps: "DPS",
};

const ROLE_ORDER: Record<RoleKey, number> = {
  tank: 0,
  heal: 1,
  dps: 2,
};

const ROLE_COLORS: Record<RoleKey, string> = {
  tank: "var(--color-tank)",
  heal: "var(--color-heal)",
  dps: "var(--color-dps)",
};

const defaultConfig: Record<RoleKey, RoleConfig> = {
  tank: { count: "2", minIlvlDifficulty: "mythic" },
  heal: { count: "4", minIlvlDifficulty: "mythic" },
  dps: { count: "12", minIlvlDifficulty: "mythic" },
};

function totalSlots(config: Record<RoleKey, RoleConfig>) {
  return (Object.keys(config) as RoleKey[]).reduce(
    (sum, role) => sum + (Number(config[role].count) || 0),
    0
  );
}

function pickMochilaAssignees(entries: SelectedEntry[], count: number): SelectedEntry[] {
  if (count <= 0) return [];
  const byUser = new Map<string, SelectedEntry>();
  for (const entry of entries) {
    if (!entry.candidate.hasMochila) continue;
    if (!byUser.has(entry.candidate.user_id)) byUser.set(entry.candidate.user_id, entry);
  }
  const sorted = Array.from(byUser.values())
    .map((entry) => ({ entry, tiebreak: Math.random() }))
    .sort((a, b) => a.entry.candidate.mochilaCount - b.entry.candidate.mochilaCount || a.tiebreak - b.tiebreak)
    .map((x) => x.entry);
  return sorted.slice(0, count);
}

export default function RosterClient({
  canManage,
  canGenerate,
}: {
  canManage: boolean;
  canGenerate: boolean;
}) {
  const confirm = useConfirm();
  const toast = useToast();
  const [config, setConfig] = useState<Record<RoleKey, RoleConfig>>(defaultConfig);
  const [targetAvgIlvl, setTargetAvgIlvl] = useState("");
  const [scheduledFor, setScheduledFor] = useState("");

  const [raids, setRaids] = useState<RaidDef[]>([]);
  const [useContent, setUseContent] = useState(false);
  const [selectedRaidKeys, setSelectedRaidKeys] = useState<Set<RaidKey>>(new Set());
  const [difficulty, setDifficulty] = useState<Difficulty>("heroic");
  const [savedCount, setSavedCount] = useState("0");
  const [unsavedCount, setUnsavedCount] = useState("0");

  const [useClassFilter, setUseClassFilter] = useState(false);
  const [classCounts, setClassCounts] = useState<Record<string, string>>(
    Object.fromEntries(ROSTER_CLASSES.map((c) => [c, "1"]))
  );

  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [error, setError] = useState("");
  const [hasSuggestions, setHasSuggestions] = useState(false);
  const [feasibility, setFeasibility] = useState<RosterFeasibility | null>(null);
  const [diagnostics, setDiagnostics] = useState<RosterDiagnostics | null>(null);
  const [suggestions, setSuggestions] = useState<Record<RoleKey, UserSuggestion[]>>({
    tank: [],
    heal: [],
    dps: [],
  });
  const [showOffSpec, setShowOffSpec] = useState<Record<RoleKey, boolean>>({
    tank: false,
    heal: false,
    dps: true,
  });
  const [building, setBuilding] = useState<SelectedEntry[]>([]);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [mochilaEnabled, setMochilaEnabled] = useState(false);
  const [mochilaTargetCount, setMochilaTargetCount] = useState("1");
  const [mochilaShuffleSeed, setMochilaShuffleSeed] = useState(0);
  const [forceShowSuggestions, setForceShowSuggestions] = useState(false);

  const [savedRosters, setSavedRosters] = useState<SavedRoster[]>([]);
  const [loadingSaved, setLoadingSaved] = useState(true);
  const [expandedRosterId, setExpandedRosterId] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editEntries, setEditEntries] = useState<SelectedEntry[]>([]);
  const [editMochilaAssignees, setEditMochilaAssignees] = useState<MochilaAssignee[]>([]);
  const [editMochilaRequestedCount, setEditMochilaRequestedCount] = useState("0");
  const [editSuggestions, setEditSuggestions] = useState<Record<RoleKey, UserSuggestion[]>>({
    tank: [],
    heal: [],
    dps: [],
  });
  const [editExpandedUser, setEditExpandedUser] = useState<string | null>(null);
  const [editShowOffSpec, setEditShowOffSpec] = useState<Record<RoleKey, boolean>>({
    tank: false,
    heal: false,
    dps: false,
  });
  const [savingEdit, setSavingEdit] = useState(false);
  const [editingContent, setEditingContent] = useState<RosterContentSummary | null>(null);
  const [showGenerator, setShowGenerator] = useState(false);
  const [flowMode, setFlowMode] = useState<"manual" | "auto" | null>(null);
  const [myCharacterIds, setMyCharacterIds] = useState<Set<string>>(new Set());
  const [notifyingId, setNotifyingId] = useState<string | null>(null);
  const [notifiedId, setNotifiedId] = useState<string | null>(null);
  const [ilvlDefaults, setIlvlDefaults] = useState<Record<RaidDifficulty, number>>(DEFAULT_ROSTER_ILVL);

  async function loadIlvlDefaults() {
    if (!canGenerate) return;
    try {
      const res = await fetch("/api/roster/ilvl-defaults");
      const data = await readJsonBody(res);
      if (res.ok) setIlvlDefaults({ heroic: data.heroic, mythic: data.mythic });
    } catch {}
  }

  const [scheduleSlots, setScheduleSlots] = useState<RaidScheduleSlot[]>(DEFAULT_RAID_SCHEDULE);

  const [membersConfirmed, setMembersConfirmed] = useState(false);
  const [excludedMemberIds, setExcludedMemberIds] = useState<Set<string>>(new Set());

  function handleScheduledForChange(value: string) {
    setScheduledFor(value);
    setMembersConfirmed(false);
    setExcludedMemberIds(new Set());
  }

  function toggleMemberExcluded(userId: string) {
    setExcludedMemberIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  async function loadScheduleSlots() {
    if (!canGenerate) return;
    try {
      const res = await fetch("/api/roster/schedule-defaults");
      const data = await readJsonBody(res);
      if (res.ok && data.slots) setScheduleSlots(data.slots);
    } catch {}
  }

  function applyScheduleSlot(slot: RaidScheduleSlot) {
    const todayInEst = zonedDateKey(new Date(), RAID_SCHEDULE_TIMEZONE);
    const time = `${String(slot.hour).padStart(2, "0")}:${String(slot.minute).padStart(2, "0")}`;
    const utcInstant = zonedTimeToUtc(todayInEst, time, RAID_SCHEDULE_TIMEZONE);
    const pad = (n: number) => String(n).padStart(2, "0");
    const local =
      `${utcInstant.getFullYear()}-${pad(utcInstant.getMonth() + 1)}-${pad(utcInstant.getDate())}` +
      `T${pad(utcInstant.getHours())}:${pad(utcInstant.getMinutes())}`;
    setScheduledFor(local);
  }

  function formatScheduleSlot(slot: RaidScheduleSlot): string {
    const period = slot.hour >= 12 ? "PM" : "AM";
    const hour12 = slot.hour % 12 === 0 ? 12 : slot.hour % 12;
    return `${hour12}:${String(slot.minute).padStart(2, "0")} ${period}`;
  }

  async function loadSavedRosters() {
    setLoadingSaved(true);
    const res = await fetch("/api/roster/saved");
    const data = await readJsonBody(res);
    setSavedRosters(data.rosters ?? []);
    setLoadingSaved(false);
  }

  async function loadMyCharacterIds() {
    try {
      const res = await fetch("/api/characters");
      const data = await readJsonBody(res);
      const ids = (data.characters ?? []).map((c: { id: string }) => c.id);
      setMyCharacterIds(new Set(ids));
    } catch {}
  }

  async function loadRaidCatalog() {
    const res = await fetch("/api/raids");
    if (!res.ok) return;
    const data = await readJsonBody(res);
    const fetched: RaidDef[] = data.raids ?? [];
    setRaids(fetched);
    setSelectedRaidKeys((prev) => (prev.size === 0 && fetched.length > 0 ? new Set([fetched[0].key]) : prev));
  }

  useRefetchOnReturn(() => {
    loadSavedRosters();
    loadMyCharacterIds();
    loadIlvlDefaults();
    loadScheduleSlots();
    loadRaidCatalog();
  });

  async function startEdit(roster: SavedRoster) {
    setEditingId(roster.id);
    setEditEntries(roster.selected);
    setEditMochilaAssignees(roster.mochilaAssignees ?? []);
    setEditMochilaRequestedCount(String(roster.mochilaRequestedCount ?? 0));
    setEditingContent(roster.content ?? null);
    setEditSuggestions({ tank: [], heal: [], dps: [] });
    setEditExpandedUser(null);

    try {
      const res = await fetch("/api/roster/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roles: roster.roles,
          content: roster.content ?? null,
          scheduledFor: roster.scheduledFor,
          scheduledDate: roster.scheduledFor.slice(0, 10),
          mode: "manual",
        }),
      });
      const data = await readJsonBody(res);
      if (res.ok) {
        setEditSuggestions({
          tank: data.suggestions?.tank ?? [],
          heal: data.suggestions?.heal ?? [],
          dps: data.suggestions?.dps ?? [],
        });
      }
    } catch {}
  }

  function cancelEdit() {
    setEditingId(null);
    setEditEntries([]);
    setEditMochilaAssignees([]);
    setEditMochilaRequestedCount("0");
    setEditingContent(null);
    setEditSuggestions({ tank: [], heal: [], dps: [] });
    setEditExpandedUser(null);
  }

  function removeEditEntry(characterId: string) {
    const removedEntry = editEntries.find((e) => e.candidate.id === characterId);
    setEditEntries((prev) => prev.filter((e) => e.candidate.id !== characterId));
    if (removedEntry) {
      setEditMochilaAssignees((prev) => prev.filter((a) => a.userId !== removedEntry.candidate.user_id));
    }
  }

  function removeMochilaAssignee(userId: string) {
    setEditMochilaAssignees((prev) => prev.filter((a) => a.userId !== userId));
  }

  function addMochilaAssignee(entry: SelectedEntry) {
    if (editMochilaAssignees.some((a) => a.userId === entry.candidate.user_id)) return;
    setEditMochilaAssignees((prev) => [
      ...prev,
      {
        userId: entry.candidate.user_id,
        discordUsername: entry.candidate.discord_username,
        characterId: entry.candidate.id,
        characterName: entry.candidate.name,
      },
    ]);
  }

  function addEditEntryFromCandidate(role: RoleKey, candidate: SuggestedCandidate) {
    if (editEntries.some((e) => e.candidate.id === candidate.id)) return;
    const candidateFields: Candidate = {
      id: candidate.id,
      user_id: candidate.user_id,
      name: candidate.name,
      realm_slug: candidate.realm_slug,
      region: candidate.region,
      ilvl: candidate.ilvl,
      class: candidate.class,
      active_spec: candidate.active_spec,
      discord_username: candidate.discord_username,
      isOffSpec: candidate.isOffSpec,
      specUsed: candidate.specUsed,
      hasMochila: candidate.hasMochila,
      mochilaCount: candidate.mochilaCount,
      isMainClass: candidate.isMainClass,
      isDayOff: candidate.isDayOff,
    };
    setEditEntries((prev) => [...prev, { role, candidate: candidateFields, isSaved: candidate.isSaved }]);
    setEditExpandedUser(null);
  }

  function handleAddEditUser(role: RoleKey, user: UserSuggestion) {
    if (user.characters.length === 1) {
      addEditEntryFromCandidate(role, user.characters[0]);
      return;
    }
    const key = `${role}:${user.user_id}`;
    setEditExpandedUser((prev) => (prev === key ? null : key));
  }

  async function saveEdit(id: string) {
    if (requiresVoidspireMythicMonkHeal(editingContent) && !hasMonkHeal(editEntries)) {
      toast.error("Falta un Monje Heal", VOIDSPIRE_MYTHIC_MONK_HEAL_ERROR);
      return;
    }

    setSavingEdit(true);
    try {
      const res = await fetch(`/api/roster/saved/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selected: editEntries,
          mochila: {
            requestedCount: Number(editMochilaRequestedCount) || 0,
            assignees: editMochilaAssignees,
          },
        }),
      });
      if (!res.ok) {
        const err = await readJsonBody(res).catch(() => ({}));
        toast.error("No se pudo guardar el roster", err.error || undefined);
        return;
      }
      await loadSavedRosters();
      setEditingId(null);
      setEditEntries([]);
      setEditMochilaAssignees([]);
      setEditMochilaRequestedCount("0");
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleDeleteAllSaved(id: string) {
    const confirmed = await confirm(
      "¿Eliminar por completo este roster guardado? Esta acción no se puede deshacer.",
      { danger: true, confirmLabel: "Eliminar" }
    );
    if (!confirmed) return;

    const res = await fetch(`/api/roster/saved/${id}`, { method: "DELETE" });
    if (res.ok) {
      setSavedRosters((prev) => prev.filter((r) => r.id !== id));
      if (editingId === id) cancelEdit();
      toast.success("Roster eliminado");
    } else {
      const err = await readJsonBody(res).catch(() => ({}));
      toast.error("No se pudo eliminar el roster", err.error || undefined);
    }
  }

  async function handleNotify(id: string) {
    setNotifyingId(id);
    setNotifiedId(null);
    try {
      const res = await fetch(`/api/roster/saved/${id}/notify`, { method: "POST" });
      if (res.ok) {
        setNotifiedId(id);
        setTimeout(() => setNotifiedId((prev) => (prev === id ? null : prev)), 3000);
        toast.success("Anuncio publicado en Discord");
      } else {
        const err = await readJsonBody(res).catch(() => ({}));
        toast.error("No se pudo publicar el anuncio", err.error || undefined);
      }
    } finally {
      setNotifyingId(null);
    }
  }

  function updateConfig(role: RoleKey, field: "count", value: string) {
    const nextConfig = { ...config, [role]: { ...config[role], [field]: value } };
    setConfig(nextConfig);
    const activeRaidKeys = raids.filter((r) => selectedRaidKeys.has(r.key)).map((r) => r.key);
    applyMythicUnsavedDefault(difficulty, activeRaidKeys, useContent, totalSlots(nextConfig));
  }

  function toggleRaidKey(key: RaidKey) {
    if (selectedRaidKeys.has(key) && selectedRaidKeys.size === 1) return;
    const next = new Set(selectedRaidKeys);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelectedRaidKeys(next);
    const nextRaidKeys = raids.filter((r) => next.has(r.key)).map((r) => r.key);
    applyMythicUnsavedDefault(difficulty, nextRaidKeys, useContent, total);
  }

  function setRoleDifficulty(role: RoleKey, difficulty: RaidDifficulty) {
    setConfig((prev) => ({ ...prev, [role]: { ...prev[role], minIlvlDifficulty: difficulty } }));
  }

  const total = totalSlots(config);

  const classRequirements: ClassRequirement[] = useClassFilter
    ? ROSTER_CLASSES.map((c) => ({ class: c, min: Number(classCounts[c]) || 0, max: null }))
        .filter((r) => r.min > 0)
    : [];
  const totalClassSlots = classRequirements.reduce((sum, c) => sum + c.min, 0);
  const classAssignedCount = ROSTER_CLASSES.reduce((sum, c) => sum + (Number(classCounts[c]) || 0), 0);

  const contentRaidKeys = raids.filter((r) => selectedRaidKeys.has(r.key)).map((r) => r.key);
  const availableDifficulties = DIFFICULTIES.filter((d) =>
    contentRaidKeys.every((rk) => raids.find((r) => r.key === rk)?.difficulties.includes(d.key))
  );

  function applyMythicUnsavedDefault(
    nextDifficulty: Difficulty,
    nextRaidKeys: RaidKey[],
    nextUseContent: boolean,
    nextTotal: number
  ) {
    if (!nextUseContent || nextDifficulty !== "mythic") return;
    if (nextRaidKeys.includes("sporefall")) return;
    setUnsavedCount(String(nextTotal));
  }

  const roleFilled: Record<RoleKey, number> = { tank: 0, heal: 0, dps: 0 };
  for (const e of building) roleFilled[e.role]++;

  const classFilled: Record<string, number> = {};
  for (const e of building) {
    if (e.candidate.class) classFilled[e.candidate.class] = (classFilled[e.candidate.class] ?? 0) + 1;
  }

  const savedFilled = building.filter((e) => e.isSaved === true).length;
  const unsavedFilled = building.filter((e) => e.isSaved === false).length;
  const savedRemaining = useContent ? Math.max(0, Number(savedCount) - savedFilled) : Infinity;
  const unsavedRemaining = useContent ? Math.max(0, Number(unsavedCount) - unsavedFilled) : Infinity;

  const computedAverageIlvl =
    building.length > 0 ? building.reduce((s, e) => s + e.candidate.ilvl, 0) / building.length : 0;

  const usedUserIds = new Set(building.map((e) => e.candidate.user_id));

  const mochilaAssignees = useMemo(
    () => (mochilaEnabled ? pickMochilaAssignees(building, Number(mochilaTargetCount) || 0) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [building, mochilaEnabled, mochilaTargetCount, mochilaShuffleSeed]
  );
  const mochilaEligibleCount = new Set(
    building.filter((e) => e.candidate.hasMochila).map((e) => e.candidate.user_id)
  ).size;

  function isContentEligible(candidate: SuggestedCandidate): boolean {
    if (candidate.isSaved === null) return true;
    return candidate.isSaved ? savedRemaining > 0 : unsavedRemaining > 0;
  }

  const activeRoles = (Object.keys(ROLE_LABELS) as RoleKey[])
    .map((role) => ({ role, count: Number(config[role].count) || 0 }))
    .filter((r) => r.count > 0);
  const isRoleCovered = (role: RoleKey) => roleFilled[role] >= (Number(config[role].count) || 0);
  const allRolesCovered = activeRoles.length > 0 && activeRoles.every((r) => isRoleCovered(r.role));
  const missingClasses = classRequirements.filter((req) => (classFilled[req.class] ?? 0) < req.min);
  const showSuggestionColumns =
    !allRolesCovered || (useClassFilter && missingClasses.length > 0) || forceShowSuggestions;

  async function handleSearch() {
    setError("");

    if (!scheduledFor) {
      setError("Elige la fecha y hora para la que es este roster.");
      return;
    }

    const roles = (Object.keys(config) as RoleKey[])
      .map((role) => ({
        role,
        count: Number(config[role].count),
        minIlvl: ilvlDefaults[config[role].minIlvlDifficulty],
      }))
      .filter((r) => r.count > 0);

    if (roles.length === 0) {
      setError("Pon al menos 1 en la cantidad de algún rol.");
      return;
    }

    if (building.length > 0) {
      const confirmed = await confirm(
        `Ya tienes ${building.length} personaje(s) armado(s) en este roster. Volver a buscar candidatos reinicia la selección. ¿Continuar?`,
        { title: "Reiniciar selección" }
      );
      if (!confirmed) return;
    }

    const content = useContent ? { raidKeys: contentRaidKeys, difficulty } : null;
    const isAuto = flowMode === "auto";

    setLoadingSuggestions(true);
    try {
      const res = await fetch("/api/roster/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roles,
          content,
          scheduledFor: new Date(scheduledFor).toISOString(),
          scheduledDate: scheduledFor.slice(0, 10),
          mode: flowMode,
          excludedUserIds: Array.from(excludedMemberIds),
          ...(isAuto
            ? {
                classRequirements,
                savedCount: Number(savedCount),
                unsavedCount: Number(unsavedCount),
                targetAvgIlvl: targetAvgIlvl ? Number(targetAvgIlvl) : null,
                mochilasNeeded: mochilaEnabled ? Number(mochilaTargetCount) || 0 : 0,
              }
            : {}),
        }),
      });
      const data = await readJsonBody(res);
      if (!res.ok) {
        setError(data.error || "No se pudieron buscar candidatos.");
        return;
      }
      setSuggestions({
        tank: data.suggestions?.tank ?? [],
        heal: data.suggestions?.heal ?? [],
        dps: data.suggestions?.dps ?? [],
      });
      setFeasibility(data.feasibility ?? null);
      setDiagnostics(isAuto ? data.autoDiagnostics ?? null : null);
      setBuilding(isAuto ? data.autoSelected ?? [] : []);
      setExpandedUser(null);
      setForceShowSuggestions(false);
      setHasSuggestions(true);
      setShowGenerator(false);
    } finally {
      setLoadingSuggestions(false);
    }
  }

  function addToBuilding(role: RoleKey, candidate: SuggestedCandidate) {
    const candidateFields: Candidate = {
      id: candidate.id,
      user_id: candidate.user_id,
      name: candidate.name,
      realm_slug: candidate.realm_slug,
      region: candidate.region,
      ilvl: candidate.ilvl,
      class: candidate.class,
      active_spec: candidate.active_spec,
      discord_username: candidate.discord_username,
      isOffSpec: candidate.isOffSpec,
      specUsed: candidate.specUsed,
      hasMochila: candidate.hasMochila,
      mochilaCount: candidate.mochilaCount,
      isMainClass: candidate.isMainClass,
      isDayOff: candidate.isDayOff,
    };
    setBuilding((prev) => [...prev, { role, candidate: candidateFields, isSaved: candidate.isSaved }]);
    setExpandedUser(null);
  }

  function handleAddUser(role: RoleKey, user: UserSuggestion) {
    if (user.characters.length === 1) {
      addToBuilding(role, user.characters[0]);
      return;
    }
    const key = `${role}:${user.user_id}`;
    setExpandedUser((prev) => (prev === key ? null : key));
  }

  function removeFromBuilding(characterId: string) {
    setBuilding((prev) => prev.filter((e) => e.candidate.id !== characterId));
  }

  async function handleConfirm() {
    setError("");

    const content = useContent
      ? {
          raidKeys: contentRaidKeys,
          difficulty,
          savedCount: Number(savedCount),
          unsavedCount: Number(unsavedCount),
        }
      : null;

    if (requiresVoidspireMythicMonkHeal(content) && !hasMonkHeal(building)) {
      setError(VOIDSPIRE_MYTHIC_MONK_HEAL_ERROR);
      return;
    }

    const roles = (Object.keys(config) as RoleKey[])
      .map((role) => ({
        role,
        count: Number(config[role].count),
        minIlvl: ilvlDefaults[config[role].minIlvlDifficulty],
      }))
      .filter((r) => r.count > 0);

    const missingRoles = roles.filter((r) => roleFilled[r.role] < r.count);

    if (missingRoles.length > 0 || missingClasses.length > 0) {
      const parts: string[] = [];
      if (missingRoles.length > 0) {
        parts.push(
          `Cupos sin cubrir: ${missingRoles
            .map((r) => `${r.count - roleFilled[r.role]} ${ROLE_LABELS[r.role]}`)
            .join(", ")}.`
        );
      }
      if (missingClasses.length > 0) {
        parts.push(
          `Clases sin completar: ${missingClasses
            .map((req) => `${req.class} (${classFilled[req.class] ?? 0}/${req.min})`)
            .join(", ")}.`
        );
      }
      const confirmed = await confirm(`${parts.join(" ")} ¿Quieres continuar y crear el roster igual?`, {
        title: "Roster incompleto",
        confirmLabel: "Crear roster igual",
      });
      if (!confirmed) return;
    }

    const targetAvgIlvlValue = targetAvgIlvl ? Number(targetAvgIlvl) : null;

    setConfirming(true);
    try {
      const res = await fetch("/api/roster/saved", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduledFor: new Date(scheduledFor).toISOString(),
          roles,
          targetAvgIlvl: targetAvgIlvlValue,
          content,
          classRequirements,
          selected: building,
          averageIlvl: computedAverageIlvl,
          mochila: mochilaEnabled
            ? {
                requestedCount: Number(mochilaTargetCount) || 0,
                assignees: mochilaAssignees.map((e) => ({
                  userId: e.candidate.user_id,
                  discordUsername: e.candidate.discord_username,
                  characterId: e.candidate.id,
                  characterName: e.candidate.name,
                })),
              }
            : undefined,
        }),
      });
      if (!res.ok) {
        const err = await readJsonBody(res).catch(() => ({}));
        setError(err.error || "No se pudo guardar el roster.");
        return;
      }
      setBuilding([]);
      setHasSuggestions(false);
      setSuggestions({ tank: [], heal: [], dps: [] });
      setFeasibility(null);
      setFlowMode(null);
      setMochilaEnabled(false);
      setMochilaTargetCount("1");
      setMochilaShuffleSeed(0);
      await loadSavedRosters();
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Raid"
        icon={Users}
        title="Roster"
        description={
          canGenerate
            ? "Busca candidatos disponibles y arma el roster a mano, rol por rol"
            : "Rosters decididos por el líder — fíjate qué personaje te toca logear"
        }
      />

      {canManage && (
        <AdminIlvlSettingsPanel
          ilvlDefaults={ilvlDefaults}
          onSaved={setIlvlDefaults}
          scheduleSlots={scheduleSlots}
          onScheduleSaved={setScheduleSlots}
        />
      )}

      {canGenerate && (
        <div className="card p-6 mb-8">
          <SectionToggle
            icon={Plus}
            title="Crear nuevo roster"
            hint={
              flowMode === "auto"
                ? "Modo Automático — el generador propone el roster completo"
                : flowMode === "manual"
                  ? "Modo Manual — eliges cada personaje rol por rol"
                  : "Elige entre armarlo a mano o dejar que el generador lo proponga"
            }
            open={showGenerator}
            onToggle={() => setShowGenerator((v) => !v)}
            closedLabel="Abrir"
          />

          {showGenerator && (
          <div className="space-y-6 mt-6">
          {flowMode === null ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <ModeCard
                icon={<Users className="w-6 h-6" />}
                title="Roster Manual"
                description="Busca candidatos elegibles y arma el roster tú mismo, personaje por personaje."
                onClick={() => setFlowMode("manual")}
                color="var(--color-secondary)"
              />
              <ModeCard
                icon={<Wand2 className="w-6 h-6" />}
                title="Roster Automático"
                description="El sistema prueba distintas combinaciones y arma una propuesta completa respetando roles, ilvl y clases pedidas — puedes ajustarla antes de confirmar."
                onClick={() => setFlowMode("auto")}
                color="var(--color-primary)"
              />
            </div>
          ) : (
          <>
          <button
            type="button"
            onClick={() => setFlowMode(null)}
            className="text-ink-faint hover:text-[color:var(--color-ink)] text-xs font-medium transition-colors"
          >
            ‹ Cambiar modo
          </button>
          <div>
            <label className="block text-xs text-ink-muted mb-1.5 font-medium">
              ¿Para qué día y hora es este roster?
            </label>
            <DateField value={scheduledFor} onChange={handleScheduledForChange} mode="datetime" className="w-56" />
            <div className="flex flex-wrap gap-1.5 mt-2">
              {scheduleSlots.map((slot) => (
                <button
                  key={slot.slotIndex}
                  type="button"
                  onClick={() => applyScheduleSlot(slot)}
                  className="text-xs font-semibold px-2.5 py-1 rounded-full transition-colors"
                  style={{
                    color: "var(--color-ink-muted)",
                    backgroundColor: "var(--color-surface)",
                    border: "1px solid var(--color-line)",
                  }}
                >
                  Hoy {formatScheduleSlot(slot)}
                </button>
              ))}
            </div>
          </div>

          {scheduledFor && (!membersConfirmed ? (
            <MemberInclusionGrid
              date={scheduledFor.slice(0, 10)}
              excludedUserIds={excludedMemberIds}
              onToggle={toggleMemberExcluded}
              onMembersLoaded={(dayOffUserIds) => setExcludedMemberIds(new Set(dayOffUserIds))}
              onContinue={() => setMembersConfirmed(true)}
            />
          ) : (
          <>
          <button
            type="button"
            onClick={() => setMembersConfirmed(false)}
            className="text-ink-faint hover:text-[color:var(--color-ink)] text-xs font-medium transition-colors"
          >
            ‹ Cambiar miembros
          </button>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-stretch">
            <div
              className="rounded-xl overflow-hidden h-full flex flex-col justify-center"
              style={{ backgroundColor: "var(--color-surface-2)", border: "1px solid var(--color-line)" }}
            >
              {(Object.keys(ROLE_LABELS) as RoleKey[]).map((role, i) => (
                <div
                  key={role}
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-3"
                  style={i > 0 ? { borderTop: "1px solid var(--color-line)" } : undefined}
                >
                  <div className="flex items-center gap-2 shrink-0">
                    <RoleIcon role={role} size={18} />
                    <p className="font-heading font-semibold text-ink text-sm">{ROLE_LABELS[role]}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <label htmlFor={`count-${role}`} className="text-xs text-ink-faint font-medium">
                      Cantidad
                    </label>
                    <input
                      id={`count-${role}`}
                      type="number"
                      min="0"
                      value={config[role].count}
                      onChange={(e) => updateConfig(role, "count", e.target.value)}
                      aria-label={`Cantidad de ${ROLE_LABELS[role]}`}
                      className="input px-2 py-1.5 text-sm w-14 shrink-0 text-center"
                    />
                  </div>
                  <SegmentedToggle
                    ariaLabel={`Dificultad mínima de ${ROLE_LABELS[role]}`}
                    value={config[role].minIlvlDifficulty}
                    onChange={(v) => setRoleDifficulty(role, v)}
                    options={[
                      { value: "heroic" as const, label: "HC", sublabel: String(ilvlDefaults.heroic) },
                      { value: "mythic" as const, label: "M", sublabel: String(ilvlDefaults.mythic) },
                    ]}
                  />
                </div>
              ))}
            </div>

            <div className="h-full flex flex-col">
              <FilterColumnHeader
                label="Clase específica"
                checked={useClassFilter}
                onChange={setUseClassFilter}
                extra={
                  <span className="font-data text-xs whitespace-nowrap">
                    <span
                      className="font-bold"
                      style={{
                        color:
                          classAssignedCount > total ? "var(--color-gold)" : "var(--color-ink-muted)",
                      }}
                    >
                      {classAssignedCount}
                    </span>
                    <span className="text-ink-faint"> de {total} asignadas</span>
                  </span>
                }
              />
              <FilterColumnBox active={useClassFilter} placeholder="Actívalo para pedir cantidades por clase.">
                <div className="grid grid-cols-3 gap-2">
                  {ROSTER_CLASSES.map((c) => (
                    <ClassCountDial
                      key={c}
                      wowClass={c}
                      label={CLASS_CHIP_LABEL[c] ?? c}
                      color={classColor(c)}
                      count={Number(classCounts[c]) || 0}
                      onCountChange={(n) => setClassCounts((prev) => ({ ...prev, [c]: String(n) }))}
                    />
                  ))}
                </div>
                {totalClassSlots > total && (
                  <p className="text-xs mt-2" style={{ color: "var(--color-gold)" }}>
                    La suma por clase ({totalClassSlots}) supera el total de cupos del roster ({total}) —
                    es solo una guía, no es obligatorio cumplirla.
                  </p>
                )}
              </FilterColumnBox>
            </div>

            <div className="h-full flex flex-col">
              <FilterColumnHeader
                label="Filtro de contenido"
                checked={useContent}
                onChange={(v) => {
                  setUseContent(v);
                  applyMythicUnsavedDefault(difficulty, contentRaidKeys, v, total);
                }}
              />
              <FilterColumnBox
                active={useContent}
                placeholder="Actívalo para elegir raid, dificultad y saved/unsaved."
              >
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {raids.map((raid) => {
                      const active = selectedRaidKeys.has(raid.key);
                      return (
                        <button
                          key={raid.key}
                          type="button"
                          onClick={() => toggleRaidKey(raid.key)}
                          aria-pressed={active}
                          title={raid.name}
                          className="w-10 h-10 rounded-full flex items-center justify-center text-label font-bold shrink-0 transition-all"
                          style={
                            active
                              ? {
                                  color: "#0b0d12",
                                  backgroundColor: raid.color,
                                  boxShadow: `0 0 0 2px color-mix(in srgb, ${raid.color} 70%, transparent), 0 0 14px 0 color-mix(in srgb, ${raid.color} 55%, transparent)`,
                                }
                              : {
                                  color: "var(--color-ink-faint)",
                                  backgroundColor: "var(--color-surface)",
                                  border: "1px solid var(--color-line)",
                                }
                          }
                        >
                          {raid.abbr}
                        </button>
                      );
                    })}
                  </div>
                  {contentRaidKeys.length > 0 && (
                    <p className="text-xs text-ink-faint">
                      Se guardará como{" "}
                      <span className="text-ink font-medium">{contentRaidLabel(contentRaidKeys, raids)}</span>
                    </p>
                  )}
                  <div className="h-px" style={{ backgroundColor: "var(--color-line)" }} />
                  <SegmentedToggle
                    ariaLabel="Dificultad"
                    value={difficulty}
                    onChange={(v) => {
                      setDifficulty(v);
                      if (v === "mythic") {
                        applyMythicUnsavedDefault(v, contentRaidKeys, useContent, total);
                      } else {
                        setSavedCount("0");
                        setUnsavedCount("0");
                      }
                    }}
                    options={availableDifficulties.map((d) => ({ value: d.key, label: d.label }))}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <SavedUnsavedBox
                      label="Saved"
                      value={savedCount}
                      onChange={setSavedCount}
                      accent="var(--color-danger)"
                      total={total}
                    />
                    <SavedUnsavedBox
                      label="Unsaved"
                      value={unsavedCount}
                      onChange={setUnsavedCount}
                      accent="var(--color-success)"
                      total={total}
                    />
                  </div>
                </div>
              </FilterColumnBox>
            </div>

            <div className="h-full flex flex-col">
              <FilterColumnHeader label="Mochila" checked={mochilaEnabled} onChange={setMochilaEnabled} />
              <FilterColumnBox
                active={mochilaEnabled}
                placeholder="Actívalo para sortear quién lleva una segunda cuenta."
              >
                <div
                  className="flex-1 flex flex-col items-center justify-center gap-3 text-center"
                  title="Sortea, entre los ya elegidos como booster que tienen multicuentas marcada en Personajes, a quién le toca llevar una segunda cuenta a la run. No ocupa cupo de rol."
                >
                  <IconBadge icon={Backpack} color="var(--color-secondary)" size="lg" />
                  <p className="text-sm font-semibold text-ink-muted">Cuántas mochilas</p>
                  <CountStepper
                    value={mochilaTargetCount}
                    onChange={setMochilaTargetCount}
                    accent="var(--color-secondary)"
                    size="lg"
                  />
                  <IconAction
                    icon={Shuffle}
                    label="Volver a sortear"
                    onClick={() => setMochilaShuffleSeed((s) => s + 1)}
                  />
                </div>
              </FilterColumnBox>
            </div>
          </div>

          <div>
            <label className="block text-xs text-ink-muted mb-1.5 font-medium">
              Promedio de ilvl deseado (opcional, total del roster: {total})
            </label>
            <input
              type="number"
              min="0"
              value={targetAvgIlvl}
              onChange={(e) => setTargetAvgIlvl(e.target.value)}
              placeholder="ej: 270"
              className="input px-3 py-2 text-sm w-40"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 pt-5 border-t border-line">
            {error ? (
              <p className="text-xs font-semibold" style={{ color: "var(--color-danger)" }}>
                {error}
              </p>
            ) : (
              <div className="flex items-center gap-4 flex-wrap">
                {(Object.keys(ROLE_LABELS) as RoleKey[]).map((role) => (
                  <span key={role} className="inline-flex items-center gap-1.5" title={ROLE_LABELS[role]}>
                    <RoleIcon role={role} size={16} />
                    <span className="font-data text-sm font-bold" style={{ color: ROLE_COLORS[role] }}>
                      {Number(config[role].count) || 0}
                    </span>
                  </span>
                ))}
                <span className="w-px h-4" style={{ backgroundColor: "var(--color-line)" }} />
                <span className="font-data text-xs text-ink-faint whitespace-nowrap">
                  {total} cupo{total === 1 ? "" : "s"} en total
                </span>
              </div>
            )}
            <button onClick={handleSearch} disabled={loadingSuggestions} className="btn btn-primary shrink-0">
              {loadingSuggestions
                ? flowMode === "auto"
                  ? "Generando..."
                  : "Buscando..."
                : flowMode === "auto"
                  ? "Generar roster automáticamente"
                  : "Buscar candidatos disponibles"}
            </button>
          </div>
          </>
          ))}

          </>
          )}
          </div>
          )}
        </div>
      )}

      {hasSuggestions && canGenerate && (
        <div className="mb-10 space-y-6">
          <div>
            <h2 className="font-heading text-lg font-semibold text-ink mb-1">Arma el roster</h2>
            <p className="text-ink-muted text-sm max-w-3xl">
              Elige a quién agregar en cada rol: solo aparecen los personajes que cumplen lo pedido
              (rol, ilvl y saved/unsaved si filtraste por contenido). El contador de clases acá es
              una guía y no bloquea a nadie — en el modo Automático sí es una regla dura.
            </p>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {(Object.keys(ROLE_LABELS) as RoleKey[]).map((role) => (
              <RoleProgressCard
                key={role}
                role={role}
                filled={roleFilled[role]}
                requested={Number(config[role].count) || 0}
              />
            ))}
            <div className="card p-4">
              <div className="flex items-center gap-2.5 mb-2">
                <IconBadge icon={Gauge} color="var(--color-primary)" size="sm" />
                <p className="text-ink-muted text-xs uppercase tracking-wide font-semibold truncate">
                  ilvl promedio
                </p>
              </div>
              <p
                className="font-data text-2xl font-bold text-ink"
                style={
                  targetAvgIlvl && building.length > 0 && computedAverageIlvl >= Number(targetAvgIlvl)
                    ? { color: "var(--color-success)" }
                    : undefined
                }
              >
                {building.length > 0 ? computedAverageIlvl.toFixed(1) : "—"}
                {targetAvgIlvl ? (
                  <span className="text-ink-faint text-base"> / {targetAvgIlvl}</span>
                ) : null}
              </p>
            </div>
          </div>


          {feasibility && feasibility.maxFillable < feasibility.requested && (
            <Notice>
              <p className="font-semibold">
                {feasibility.requested - feasibility.maxFillable} cupo
                {feasibility.requested - feasibility.maxFillable === 1 ? "" : "s"} no se puede
                {feasibility.requested - feasibility.maxFillable === 1 ? "" : "n"} llenar con la gente
                disponible — no es un error del generador.
              </p>
              <p className="mt-1.5 text-xs opacity-90">
                Cada persona ocupa un solo cupo. Como máximo se pueden llenar{" "}
                <span className="font-data font-bold">{feasibility.maxFillable}</span> de{" "}
                <span className="font-data font-bold">{feasibility.requested}</span>:{" "}
                {feasibility.byRole
                  .map((r) => `${ROLE_LABELS[r.role as RoleKey] ?? r.role} ${r.fillable}/${r.requested}`)
                  .join(" · ")}
                .
              </p>
              {feasibility.singleRoleUsers.length > 0 && (
                <p className="mt-1 text-xs opacity-90">
                  Solo pueden cubrir un rol:{" "}
                  {feasibility.singleRoleUsers
                    .map(
                      (s) =>
                        `${ROLE_LABELS[s.role as RoleKey] ?? s.role} — ${s.usernames.join(", ")}`
                    )
                    .join(" | ")}
                  .
                </p>
              )}
              <p className="mt-1.5 text-xs opacity-90">
                Para cerrarlo completo: baja la cantidad de ese rol, o marca off-specs de ese rol a más
                personas en Personajes.
              </p>
            </Notice>
          )}

          {(classRequirements.length > 0 || useContent) && (
            <div className="flex flex-wrap gap-2">
              {classRequirements.map((req) => {
                const filled = classFilled[req.class] ?? 0;
                const color = classColor(req.class);
                return (
                  <span
                    key={req.class}
                    className="text-xs font-semibold px-3 py-1.5 rounded-full"
                    style={{
                      color,
                      backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`,
                      border: `1px solid color-mix(in srgb, ${color} 35%, transparent)`,
                    }}
                  >
                    {req.class}: {filled}/{req.max ?? req.min}
                    {req.max === null && "+"}
                  </span>
                );
              })}
              {useContent && (
                <>
                  <span
                    className="text-xs font-semibold px-3 py-1.5 rounded-full"
                    style={{
                      color: "var(--color-danger)",
                      backgroundColor: "color-mix(in srgb, var(--color-danger) 12%, transparent)",
                      border: "1px solid color-mix(in srgb, var(--color-danger) 35%, transparent)",
                    }}
                  >
                    Saved: {savedFilled}/{savedCount}
                  </span>
                  <span
                    className="text-xs font-semibold px-3 py-1.5 rounded-full"
                    style={{
                      color: "var(--color-primary)",
                      backgroundColor: "color-mix(in srgb, var(--color-primary) 12%, transparent)",
                      border: "1px solid color-mix(in srgb, var(--color-primary) 35%, transparent)",
                    }}
                  >
                    Unsaved: {unsavedFilled}/{unsavedCount}
                  </span>
                </>
              )}
            </div>
          )}

          {diagnostics && <AutoDiagnosticsPanel diagnostics={diagnostics} />}

          {allRolesCovered && useClassFilter && missingClasses.length > 0 && (
            <Notice>
              Los roles ya están cubiertos, pero todavía faltan estas clases:{" "}
              {missingClasses
                .map((req) => `${req.class} (${classFilled[req.class] ?? 0}/${req.min})`)
                .join(", ")}
              .
            </Notice>
          )}

          {showSuggestionColumns ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {(Object.keys(ROLE_LABELS) as RoleKey[]).map((role) => (
                <RoleSuggestionColumn
                  key={role}
                  role={role}
                  covered={isRoleCovered(role)}
                  filled={roleFilled[role]}
                  requested={Number(config[role].count) || 0}
                  users={suggestions[role]
                    .filter((u) => !usedUserIds.has(u.user_id))
                    .map((u) => ({ ...u, characters: u.characters.filter(isContentEligible) }))
                    .filter((u) => u.characters.length > 0)}
                  expandedUser={expandedUser}
                  onAdd={handleAddUser}
                  onPick={addToBuilding}
                  showOffSpec={showOffSpec[role]}
                  onToggleOffSpec={(v) => setShowOffSpec((prev) => ({ ...prev, [role]: v }))}
                />
              ))}
            </div>
          ) : (
            <div className="card p-4 flex items-center justify-between gap-3">
              <p className="text-sm text-ink-muted flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: "var(--color-success)" }} />
                Todos los cupos están cubiertos. Las columnas de sugerencias se ocultaron para no
                ocupar espacio.
              </p>
              <button
                type="button"
                onClick={() => setForceShowSuggestions(true)}
                className="btn btn-ghost !px-3 !py-1.5 text-xs shrink-0"
              >
                Seguir buscando candidatos
              </button>
            </div>
          )}

          <div>
            <div className="flex items-center gap-3 mb-2.5 px-1">
              <h3 className="text-caption">Roster en progreso</h3>
              <span className="h-px flex-1" style={{ backgroundColor: "var(--color-line)" }} />
              <span className="font-data text-xs text-ink-faint whitespace-nowrap">
                {building.length} / {total} cupos
              </span>
            </div>
            <RosterPreviewGrid
              selected={building}
              showStatus={useContent}
              onRemove={removeFromBuilding}
              myCharacterIds={myCharacterIds}
            />
          </div>

          {mochilaEnabled && (
            <MochilaSummary
              boosterCount={building.length}
              assignees={mochilaAssignees.map((e) => ({
                userId: e.candidate.user_id,
                discordUsername: e.candidate.discord_username,
                characterName: e.candidate.name,
              }))}
            />
          )}
          {mochilaEnabled && mochilaAssignees.length < (Number(mochilaTargetCount) || 0) && (
            <Notice compact>
              Pediste {mochilaTargetCount} mochila{Number(mochilaTargetCount) === 1 ? "" : "s"} pero solo
              hay {mochilaEligibleCount} marcado{mochilaEligibleCount === 1 ? "" : "s"} con multicuentas
              entre los ya elegidos.
            </Notice>
          )}

          {useContent &&
            requiresVoidspireMythicMonkHeal({ raidKeys: contentRaidKeys, difficulty }) &&
            !hasMonkHeal(building) && <Notice compact>{VOIDSPIRE_MYTHIC_MONK_HEAL_ERROR}</Notice>}

          {error && (
            <p className="text-xs" style={{ color: "var(--color-danger)" }}>
              {error}
            </p>
          )}

          {canManage ? (
            <button
              onClick={handleConfirm}
              disabled={confirming || building.length === 0}
              className="btn btn-primary"
            >
              {confirming ? "Guardando..." : "Confirmar Roster"}
            </button>
          ) : (
            <p className="text-xs text-ink-faint">
              Como invitado puedes armar la preview, pero no guardarla.
            </p>
          )}
        </div>
      )}

      <div>
        <div className="flex items-center gap-3 mb-3">
          <h2 className="font-heading text-lg font-semibold text-ink whitespace-nowrap">
            Rosters guardados
          </h2>
          <span className="pill pill-common font-data">{savedRosters.length}</span>
          <span className="h-px flex-1" style={{ backgroundColor: "var(--color-line)" }} />
          {savedRosters.length > 0 && (
            <span className="text-xs text-ink-faint whitespace-nowrap">
              Se borran solos 24 h después de creados
            </span>
          )}
        </div>

        {loadingSaved ? (
          <p className="text-ink-muted text-sm">Cargando...</p>
        ) : savedRosters.length === 0 ? (
          <div className="card p-6">
            <EmptyState
              icon={Users}
              message="Todavía no hay rosters guardados"
              description={
                canGenerate
                  ? "Arma uno desde “Crear nuevo roster”: al confirmarlo aparece acá y puedes anunciarlo en Discord."
                  : "Cuando el líder confirme el roster de la próxima run, aparece acá con el personaje que te toca logear."
              }
            />
          </div>
        ) : (
          <div className="space-y-3">
            {savedRosters.map((r, index) => {
              const isEditing = editingId === r.id;
              const isOpen = isEditing || expandedRosterId === r.id;
              const entries = isEditing ? editEntries : r.selected;
              const hasMyCharacter = r.selected.some((s) => myCharacterIds.has(s.candidate.id));
              return (
                <div key={r.id} className="card cascade-item" style={cascadeStyle(index)}>
                  <div className="p-4 flex flex-wrap items-center gap-x-4 gap-y-3">
                    <button
                      type="button"
                      onClick={() => setExpandedRosterId(isOpen ? null : r.id)}
                      aria-expanded={isOpen}
                      className="flex items-center gap-2.5 text-left min-w-0 flex-1"
                    >
                      <ChevronDown
                        className="w-4 h-4 shrink-0 text-ink-faint transition-transform duration-200"
                        style={{ transform: isOpen ? "rotate(0deg)" : "rotate(-90deg)" }}
                      />
                      <span className="min-w-0">
                        <span className="font-heading font-semibold text-ink block truncate">
                          {formatRosterTitle(r.scheduledFor, r.content, raids)}
                        </span>
                        <span className="text-ink-faint text-xs block truncate">
                          {entries.length} personajes · creado por {r.createdBy}
                        </span>
                      </span>
                    </button>

                    <CompositionStrip entries={entries} />

                    {r.mochilaAssignees.length > 0 && (
                      <span className="pill pill-accent" title="Lleva una segunda cuenta a la run">
                        {r.mochilaAssignees.length} mochila{r.mochilaAssignees.length === 1 ? "" : "s"}
                      </span>
                    )}

                    {hasMyCharacter && (
                      <span className="pill pill-accent" title="Tienes un personaje en este roster">
                        <Star className="w-3 h-3 fill-current" />
                        Estás acá
                      </span>
                    )}

                    {canManage && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleNotify(r.id)}
                          disabled={notifyingId === r.id}
                          title="Publicar o actualizar el anuncio de este roster en Discord"
                          className="btn btn-ghost !px-2.5 !py-1.5 !text-xs"
                          style={notifiedId === r.id ? { color: "var(--color-success)" } : undefined}
                        >
                          {notifiedId === r.id ? (
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          ) : (
                            <Megaphone className="w-3.5 h-3.5" />
                          )}
                          {notifyingId === r.id
                            ? "Notificando..."
                            : notifiedId === r.id
                              ? "Notificado"
                              : "Notificar"}
                        </button>
                        {!isEditing && (
                          <IconAction
                            icon={Pencil}
                            label="Editar personajes de este roster"
                            onClick={() => startEdit(r)}
                            className="hover:text-[color:var(--color-secondary)]"
                          />
                        )}
                        <IconAction
                          icon={Trash2}
                          label="Eliminar roster guardado por completo"
                          onClick={() => handleDeleteAllSaved(r.id)}
                          className="hover:text-[color:var(--color-danger)]"
                        />
                      </div>
                    )}
                  </div>

                  {isOpen && (
                  <div className="px-4 pb-4 pt-4 border-t border-line">
                    {isEditing ? (
                      <div className="space-y-4">
                        <RosterTable
                          selected={editEntries}
                          showStatus={editEntries.some((s) => s.isSaved !== null)}
                          onRemove={removeEditEntry}
                          myCharacterIds={myCharacterIds}
                        />

                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                          {(Object.keys(ROLE_LABELS) as RoleKey[]).map((role) => {
                            const requested = r.roles.find((rr) => rr.role === role)?.count ?? 0;
                            const filled = editEntries.filter((e) => e.role === role).length;
                            const usedUserIds = new Set(editEntries.map((e) => e.candidate.user_id));
                            return (
                              <RoleSuggestionColumn
                                key={role}
                                role={role}
                                covered={requested > 0 && filled >= requested}
                                filled={filled}
                                requested={requested}
                                users={(editSuggestions[role] ?? []).filter(
                                  (u) => !usedUserIds.has(u.user_id)
                                )}
                                expandedUser={editExpandedUser}
                                onAdd={handleAddEditUser}
                                onPick={addEditEntryFromCandidate}
                                showOffSpec={editShowOffSpec[role]}
                                onToggleOffSpec={(v) =>
                                  setEditShowOffSpec((prev) => ({ ...prev, [role]: v }))
                                }
                              />
                            );
                          })}
                        </div>

                        {(() => {
                          const mochilaCandidates = editEntries.filter(
                            (e) =>
                              e.candidate.hasMochila &&
                              !editMochilaAssignees.some((a) => a.userId === e.candidate.user_id)
                          );
                          return (
                            <div className="space-y-3">
                              <MochilaSummary
                                boosterCount={editEntries.length}
                                assignees={editMochilaAssignees}
                                onRemove={removeMochilaAssignee}
                              />
                              <div className="flex flex-wrap items-end gap-3">
                                <div>
                                  <label className="block text-xs text-ink-muted mb-1.5 font-medium">
                                    Cantidad de mochilas pedidas
                                  </label>
                                  <input
                                    type="number"
                                    min="0"
                                    value={editMochilaRequestedCount}
                                    onChange={(e) => setEditMochilaRequestedCount(e.target.value)}
                                    className="input px-3 py-2 text-sm w-24"
                                  />
                                </div>
                                {mochilaCandidates.length > 0 && (
                                  <div className="flex items-end gap-2">
                                    <div>
                                      <label className="block text-xs text-ink-muted mb-1.5 font-medium">
                                        Agregar mochila
                                      </label>
                                      <select
                                        value=""
                                        onChange={(e) => {
                                          const entry = mochilaCandidates.find(
                                            (c) => c.candidate.id === e.target.value
                                          );
                                          if (entry) addMochilaAssignee(entry);
                                        }}
                                        className="input px-3 py-2 text-sm"
                                      >
                                        <option value="" disabled>
                                          Elige a alguien...
                                        </option>
                                        {mochilaCandidates.map((c) => (
                                          <option key={c.candidate.id} value={c.candidate.id}>
                                            {c.candidate.discord_username} — {capitalize(c.candidate.name)}
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })()}

                        {requiresVoidspireMythicMonkHeal(editingContent) && !hasMonkHeal(editEntries) && (
                          <Notice compact>{VOIDSPIRE_MYTHIC_MONK_HEAL_ERROR}</Notice>
                        )}

                        <div className="flex gap-3">
                          <button
                            type="button"
                            onClick={() => saveEdit(r.id)}
                            disabled={savingEdit}
                            className="btn btn-primary"
                          >
                            {savingEdit ? "Guardando..." : "Guardar cambios"}
                          </button>
                          <button type="button" onClick={cancelEdit} className="btn btn-ghost">
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <RosterTable
                          selected={r.selected}
                          showStatus={r.selected.some((s) => s.isSaved !== null)}
                          myCharacterIds={myCharacterIds}
                        />
                        {r.mochilaAssignees.length > 0 && (
                          <MochilaSummary boosterCount={r.selected.length} assignees={r.mochilaAssignees} />
                        )}
                      </div>
                    )}
                  </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}

function Notice({ children, compact = false }: { children: ReactNode; compact?: boolean }) {
  return (
    <div
      className={compact ? "text-xs font-semibold rounded-lg px-3 py-2" : "text-sm rounded-xl p-4"}
      style={{
        backgroundColor: "color-mix(in srgb, var(--color-warning) 10%, transparent)",
        border: "1px solid color-mix(in srgb, var(--color-warning) 35%, transparent)",
        color: "var(--color-warning)",
      }}
    >
      {children}
    </div>
  );
}

function FilterColumnHeader({
  label,
  extra,
  checked,
  onChange,
}: {
  label: string;
  extra?: ReactNode;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 mb-2">
      <span className="flex items-center gap-2 min-w-0">
        <span className="text-xs font-bold uppercase tracking-wide text-ink-faint whitespace-nowrap">{label}</span>
        {extra}
      </span>
      <PillToggle checked={checked} onChange={onChange} label="Activar" />
    </div>
  );
}

function FilterColumnBox({
  active,
  placeholder,
  children,
}: {
  active: boolean;
  placeholder: string;
  children: ReactNode;
}) {
  return (
    <div
      className="rounded-xl p-3 flex-1 flex flex-col relative"
      style={{ backgroundColor: "var(--color-surface-2)", border: "1px solid var(--color-line)" }}
    >
      <div className={`flex-1 flex flex-col ${active ? "" : "invisible"}`}>{children}</div>
      {!active && (
        <div className="absolute inset-3 flex items-center justify-center text-center">
          <p className="text-xs text-ink-faint">{placeholder}</p>
        </div>
      )}
    </div>
  );
}

function ClassCountDial({
  wowClass,
  label,
  color,
  count,
  onCountChange,
}: {
  wowClass: string;
  label?: string;
  color: string;
  count: number;
  onCountChange: (n: number) => void;
}) {
  return (
    <div
      className="rounded-xl px-2 py-2 flex flex-col items-center gap-1.5"
      style={{
        backgroundColor: `color-mix(in srgb, ${color} 10%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 32%, transparent)`,
      }}
    >
      <span className="text-xs font-bold whitespace-nowrap" style={{ color }} title={wowClass}>
        {label ?? wowClass}
      </span>
      <CountStepper
        value={String(count)}
        onChange={(v) => onCountChange(Math.max(0, Number(v) || 0))}
        accent={color}
      />
    </div>
  );
}

function CountStepper({
  value,
  onChange,
  accent,
  size = "md",
}: {
  value: string;
  onChange: (value: string) => void;
  accent: string;
  size?: "md" | "lg";
}) {
  const n = Number(value) || 0;
  const btnSize = size === "lg" ? "w-8 h-8 text-base" : "w-6 h-6";
  const inputSize = size === "lg" ? "text-base w-11" : "text-sm w-9";
  return (
    <div
      className={`inline-flex items-center rounded-lg ${size === "lg" ? "gap-1 px-1.5 py-1.5" : "gap-0.5 px-1 py-1"}`}
      style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-line)" }}
    >
      <button
        type="button"
        onClick={() => onChange(String(Math.max(0, n - 1)))}
        aria-label="Restar"
        className={`${btnSize} rounded-md flex items-center justify-center font-bold text-ink-muted hover:bg-[color:var(--color-surface-2)] transition-colors`}
      >
        −
      </button>
      <input
        type="number"
        min="0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Cantidad"
        className={`font-data ${inputSize} font-bold text-center bg-transparent outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`}
        style={{ color: accent }}
      />
      <button
        type="button"
        onClick={() => onChange(String(n + 1))}
        aria-label="Sumar"
        className={`${btnSize} rounded-md flex items-center justify-center font-bold text-ink-muted hover:bg-[color:var(--color-surface-2)] transition-colors`}
      >
        +
      </button>
    </div>
  );
}

function SavedUnsavedBox({
  label,
  value,
  onChange,
  accent,
  total,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  accent: string;
  total: number;
}) {
  return (
    <div
      className="rounded-lg p-2 flex flex-col gap-1.5"
      style={{
        backgroundColor: `color-mix(in srgb, ${accent} 10%, transparent)`,
        border: `1px solid color-mix(in srgb, ${accent} 30%, transparent)`,
      }}
    >
      <span className="text-label font-bold uppercase tracking-wide" style={{ color: accent }}>
        {label}
      </span>
      <div className="flex items-center gap-1.5">
        <CountStepper value={value} onChange={onChange} accent={accent} />
        <button
          type="button"
          onClick={() => onChange(String(total))}
          title={`Poner el total del roster (${total})`}
          className="text-label font-semibold text-ink-faint hover:text-[color:var(--color-gold)] transition-colors shrink-0"
        >
          Max
        </button>
      </div>
    </div>
  );
}

function RoleProgressCard({
  role,
  filled,
  requested,
}: {
  role: RoleKey;
  filled: number;
  requested: number;
}) {
  const color = ROLE_COLORS[role];
  const covered = requested > 0 && filled >= requested;
  const pct = requested > 0 ? Math.min(100, (filled / requested) * 100) : 0;
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2.5 mb-2">
        <RoleIcon role={role} size={28} />
        <p className="text-ink-muted text-xs uppercase tracking-wide font-semibold truncate">
          {ROLE_LABELS[role]}
        </p>
        {covered && (
          <CheckCircle2 className="w-4 h-4 ml-auto shrink-0" style={{ color: "var(--color-success)" }} />
        )}
      </div>
      <p className="font-data text-2xl font-bold text-ink">
        {filled} <span className="text-ink-faint text-base">/ {requested}</span>
      </p>
      <div
        className="h-1 rounded-full mt-2.5 overflow-hidden"
        style={{ backgroundColor: "var(--color-line)" }}
      >
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{
            width: `${pct}%`,
            backgroundColor: covered ? "var(--color-success)" : color,
          }}
        />
      </div>
    </div>
  );
}

function CompositionStrip({ entries }: { entries: SelectedEntry[] }) {
  const counts: Record<RoleKey, number> = { tank: 0, heal: 0, dps: 0 };
  for (const e of entries) counts[e.role]++;
  const avgIlvl =
    entries.length > 0 ? entries.reduce((sum, e) => sum + e.candidate.ilvl, 0) / entries.length : 0;

  return (
    <div
      className="flex items-center gap-3 rounded-lg px-3 py-1.5 shrink-0"
      style={{ backgroundColor: "var(--color-surface-2)", border: "1px solid var(--color-line)" }}
    >
      {(Object.keys(ROLE_LABELS) as RoleKey[]).map((role) => (
        <span key={role} className="inline-flex items-center gap-1.5" title={ROLE_LABELS[role]}>
          <RoleIcon role={role} size={18} />
          <span className="font-data text-sm font-bold" style={{ color: ROLE_COLORS[role] }}>
            {counts[role]}
          </span>
        </span>
      ))}
      <span className="w-px h-4" style={{ backgroundColor: "var(--color-line)" }} />
      <span className="font-data text-xs text-ink-faint whitespace-nowrap">
        ilvl <span className="font-bold text-ink">{entries.length > 0 ? avgIlvl.toFixed(1) : "—"}</span>
      </span>
    </div>
  );
}

function ModeCard({
  icon,
  title,
  description,
  onClick,
  color,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  onClick: () => void;
  color: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="card card-hover p-6 text-left flex flex-col gap-3"
      style={{ "--card-glow": `color-mix(in srgb, ${color} 35%, transparent)` } as React.CSSProperties}
    >
      <div
        className="w-11 h-11 rounded-xl flex items-center justify-center"
        style={{
          color,
          backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)`,
        }}
      >
        {icon}
      </div>
      <p className="font-heading font-semibold text-ink">{title}</p>
      <p className="text-ink-muted text-sm">{description}</p>
    </button>
  );
}

function OffSpecBadge() {
  return (
    <span
      className="text-micro font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap"
      style={{
        color: "var(--color-secondary)",
        backgroundColor: "color-mix(in srgb, var(--color-secondary) 14%, transparent)",
      }}
    >
      Off-Spec
    </span>
  );
}

function SuggestionColumnHeader({
  role,
  filled,
  requested,
}: {
  role: RoleKey;
  filled: number;
  requested: number;
}) {
  return (
    <div className="flex items-center gap-2">
      <RoleIcon role={role} size={20} />
      <p className="font-heading font-semibold text-ink">{ROLE_LABELS[role]}</p>
      <span className="font-data text-sm font-bold ml-auto" style={{ color: ROLE_COLORS[role] }}>
        {filled}
        <span className="text-ink-faint font-normal">/{requested}</span>
      </span>
    </div>
  );
}

function RoleSuggestionColumn({
  role,
  users,
  covered,
  filled,
  requested,
  expandedUser,
  onAdd,
  onPick,
  showOffSpec,
  onToggleOffSpec,
}: {
  role: RoleKey;
  users: UserSuggestion[];
  covered: boolean;
  filled: number;
  requested: number;
  expandedUser: string | null;
  onAdd: (role: RoleKey, user: UserSuggestion) => void;
  onPick: (role: RoleKey, candidate: SuggestedCandidate) => void;
  showOffSpec: boolean;
  onToggleOffSpec: (value: boolean) => void;
}) {
  if (covered) {
    return (
      <div className="card p-4">
        <SuggestionColumnHeader role={role} filled={filled} requested={requested} />
        <div className="flex items-center justify-center py-10">
          <p className="text-sm font-semibold flex items-center gap-1.5" style={{ color: "var(--color-success)" }}>
            <CheckCircle2 className="w-4 h-4" />
            Cupos cubiertos
          </p>
        </div>
      </div>
    );
  }

  const visibleUsers = users
    .map((u) => ({ ...u, characters: showOffSpec ? u.characters : u.characters.filter((c) => !c.isOffSpec) }))
    .filter((u) => u.characters.length > 0);

  return (
    <div className="card p-4">
      <SuggestionColumnHeader role={role} filled={filled} requested={requested} />
      <p className="text-ink-faint text-xs mt-1 mb-3">
        {visibleUsers.length} disponible{visibleUsers.length === 1 ? "" : "s"}
      </p>
      <div className="mb-3">
        <PillToggle checked={showOffSpec} onChange={onToggleOffSpec} label="Incluir Off-Spec" />
      </div>
      <div className="space-y-1.5 max-h-96 overflow-y-auto pr-1">
        {visibleUsers.map((u) => {
          const key = `${role}:${u.user_id}`;
          const isExpanded = expandedUser === key;
          const isDayOff = u.characters[0]?.isDayOff ?? false;
          return (
            <div
              key={u.user_id}
              className="rounded-lg"
              style={{ backgroundColor: "var(--color-surface-2)", border: "1px solid var(--color-line)" }}
            >
              <button
                type="button"
                onClick={() => onAdd(role, u)}
                title={u.characters.length === 1 ? "Agregar al roster" : "Elegir cuál de sus personajes"}
                aria-expanded={u.characters.length > 1 ? isExpanded : undefined}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-left"
              >
                <span className="text-ink truncate">
                  {u.discord_username}
                  {u.characters.length === 1 && (
                    <span className="font-semibold" style={{ color: classColor(u.characters[0].class) }}>
                      {" "}
                      ({classShort(u.characters[0].class)})
                    </span>
                  )}
                </span>
                <span className="flex items-center gap-2 shrink-0">
                  {isDayOff && <OvertimeBadge />}
                  {u.characters.length === 1 ? (
                    <>
                      {u.characters[0].isOffSpec && <OffSpecBadge />}
                      <span className="font-data font-bold text-sm" style={{ color: "var(--color-gold)" }}>
                        {u.characters[0].ilvl}
                      </span>
                    </>
                  ) : (
                    <span className="text-ink-faint text-xs">{u.characters.length} personajes</span>
                  )}
                  <span
                    className="inline-flex items-center justify-center w-6 h-6 rounded-md shrink-0"
                    style={{
                      color: "var(--color-success)",
                      backgroundColor: "color-mix(in srgb, var(--color-success) 14%, transparent)",
                    }}
                  >
                    {u.characters.length === 1 ? (
                      <Plus className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronDown
                        className="w-3.5 h-3.5 transition-transform duration-200"
                        style={{ transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)" }}
                      />
                    )}
                  </span>
                </span>
              </button>
              {isExpanded && u.characters.length > 1 && (
                <div className="border-t border-line px-2 py-1.5 space-y-1">
                  {u.characters.map((c) => {
                    const color = classColor(c.class);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => onPick(role, c)}
                        className="w-full flex items-center justify-between px-2 py-1.5 rounded text-xs hover:bg-[color:var(--color-surface)] transition-colors text-left"
                      >
                        <span>
                          <span className="font-semibold text-ink">{capitalize(c.name)}</span>
                          <span style={{ color }}> {shortSpec(c.class, c.specUsed ?? c.active_spec)}</span>
                        </span>
                        <span className="flex items-center gap-1.5 shrink-0">
                          {c.isOffSpec && <OffSpecBadge />}
                          {c.isSaved !== null && (
                            <span
                              className="text-micro font-semibold px-1.5 py-0.5 rounded-full"
                              style={{
                                color: c.isSaved ? "var(--color-danger)" : "var(--color-success)",
                                backgroundColor: c.isSaved
                                  ? "color-mix(in srgb, var(--color-danger) 14%, transparent)"
                                  : "color-mix(in srgb, var(--color-success) 14%, transparent)",
                              }}
                            >
                              {c.isSaved ? "Saved" : "Unsaved"}
                            </span>
                          )}
                          <span className="font-data font-bold" style={{ color: "var(--color-gold)" }}>
                            {c.ilvl}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        {visibleUsers.length === 0 && (
          <p className="text-ink-faint text-xs text-center py-6">Sin candidatos elegibles.</p>
        )}
      </div>
    </div>
  );
}

function MochilaSummary({
  assignees,
  boosterCount,
  onRemove,
}: {
  assignees: { userId: string; discordUsername: string; characterName: string }[];
  boosterCount: number;
  onRemove?: (userId: string) => void;
}) {
  return (
    <div
      className="rounded-xl p-4"
      style={{ backgroundColor: "var(--color-surface-2)", border: "1px solid var(--color-line)" }}
    >
      <div className="flex items-center justify-between gap-3 mb-2.5 flex-wrap">
        <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide">Mochila</p>
        <p className="text-xs text-ink-faint">
          Boosters: <span className="font-data font-semibold text-ink">{boosterCount}</span>
          {" · "}Mochilas: <span className="font-data font-semibold text-ink">{assignees.length}</span>
          {" · "}Total:{" "}
          <span className="font-data font-semibold" style={{ color: "var(--color-gold)" }}>
            {boosterCount + assignees.length}
          </span>
        </p>
      </div>
      {assignees.length === 0 ? (
        <p className="text-xs text-ink-faint">Nadie de los ya elegidos tiene multicuentas marcada.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {assignees.map((a) => (
            <span
              key={a.userId}
              className="text-xs font-medium pl-2.5 pr-1.5 py-1.5 rounded-full flex items-center gap-1.5"
              style={{
                color: "var(--color-gold)",
                backgroundColor: "color-mix(in srgb, var(--color-gold) 14%, transparent)",
              }}
            >
              {a.discordUsername}
              {onRemove && (
                <button
                  type="button"
                  onClick={() => onRemove(a.userId)}
                  title="Sacar de mochila"
                  className="hover:opacity-70 transition-opacity"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function RosterPreviewGrid({
  selected,
  showStatus,
  onRemove,
  myCharacterIds,
}: {
  selected: SelectedEntry[];
  showStatus: boolean;
  onRemove?: (characterId: string) => void;
  myCharacterIds?: Set<string>;
}) {
  const roles = (Object.keys(ROLE_LABELS) as RoleKey[]).sort((a, b) => ROLE_ORDER[a] - ROLE_ORDER[b]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr_2.1fr] gap-4">
      {roles.map((role) => {
        const entries = selected
          .filter((e) => e.role === role)
          .sort(
            (a, b) =>
              (a.candidate.class ?? "").localeCompare(b.candidate.class ?? "") ||
              a.candidate.discord_username.localeCompare(b.candidate.discord_username)
          );
        const entriesGridClass =
          role === "dps"
            ? entries.length > 12
              ? "grid grid-cols-2 min-[1400px]:grid-cols-3 gap-1.5"
              : "grid grid-cols-1 min-[900px]:grid-cols-2 gap-1.5"
            : "space-y-1.5";
        return (
          <div key={role} className="card p-3" style={{ borderTop: `3px solid ${ROLE_COLORS[role]}` }}>
            <div className="flex items-center gap-2 mb-2.5 px-1">
              <RoleIcon role={role} size={18} />
              <span
                className="text-xs font-bold uppercase tracking-wide"
                style={{ color: ROLE_COLORS[role] }}
              >
                {ROLE_LABELS[role]}
              </span>
              <span className="font-data text-xs text-ink-faint ml-auto">{entries.length}</span>
            </div>

            {entries.length === 0 ? (
              <p className="text-ink-faint text-xs text-center py-6">Nadie todavía.</p>
            ) : (
              <div className={entriesGridClass}>
                {entries.map((s, index) => {
                  const color = classColor(s.candidate.class);
                  const isMine = myCharacterIds?.has(s.candidate.id) ?? false;
                  return (
                    <div
                      key={s.candidate.id}
                      className="rounded-lg px-2.5 py-1.5 cascade-item transition-transform hover:scale-[1.02] hover:shadow-[0_8px_20px_-8px_var(--card-glow)]"
                      style={
                        {
                          backgroundColor: `color-mix(in srgb, ${color} 12%, var(--color-surface-2))`,
                          borderLeft: `3px solid ${color}`,
                          "--card-glow": classGlow(s.candidate.class, 0.5),
                          ...cascadeStyle(index),
                          ...(isMine
                            ? {
                                outline: "2px solid var(--color-gold)",
                                outlineOffset: "-2px",
                                boxShadow: "0 0 10px 1px color-mix(in srgb, var(--color-gold) 55%, transparent)",
                              }
                            : {}),
                        } as React.CSSProperties
                      }
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold text-ink text-sm truncate">
                          {capitalize(s.candidate.name)}
                        </p>
                        <span className="flex items-center gap-1.5 shrink-0">
                          <span className="font-data font-bold text-xs" style={{ color: "var(--color-gold)" }}>
                            {s.candidate.ilvl}
                          </span>
                          {onRemove && (
                            <IconAction
                              icon={X}
                              label="Quitar del roster"
                              onClick={() => onRemove(s.candidate.id)}
                              className="hover:text-[color:var(--color-danger)]"
                            />
                          )}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-ink-faint text-xs truncate">{s.candidate.discord_username}</p>
                        <span className="flex items-center gap-1 shrink-0">
                          <span className="text-label" style={{ color }}>
                            {shortSpec(s.candidate.class, s.candidate.specUsed ?? s.candidate.active_spec)}
                          </span>
                          {s.candidate.isOffSpec && <OffSpecBadge />}
                          {s.candidate.isDayOff && <OvertimeBadge />}
                          {showStatus && s.isSaved !== null && (
                            <span
                              className="text-micro font-semibold px-1.5 py-0.5 rounded-full"
                              style={{
                                color: s.isSaved ? "var(--color-danger)" : "var(--color-success)",
                                backgroundColor: s.isSaved
                                  ? "color-mix(in srgb, var(--color-danger) 14%, transparent)"
                                  : "color-mix(in srgb, var(--color-success) 14%, transparent)",
                              }}
                            >
                              {s.isSaved ? "Saved" : "Unsaved"}
                            </span>
                          )}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function RosterTable({
  selected,
  showStatus,
  onRemove,
  myCharacterIds,
}: {
  selected: SelectedEntry[];
  showStatus: boolean;
  onRemove?: (characterId: string) => void;
  myCharacterIds?: Set<string>;
}) {
  const columnCount = 4 + (showStatus ? 1 : 0) + (onRemove ? 1 : 0);

  const groups = (Object.keys(ROLE_LABELS) as RoleKey[])
    .sort((a, b) => ROLE_ORDER[a] - ROLE_ORDER[b])
    .map((role) => ({
      role,
      entries: selected
        .filter((e) => e.role === role)
        .sort(
          (a, b) =>
            (a.candidate.class ?? "").localeCompare(b.candidate.class ?? "") ||
            a.candidate.discord_username.localeCompare(b.candidate.discord_username)
        ),
    }))
    .filter((g) => g.entries.length > 0);

  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-ink-faint text-xs uppercase tracking-wide">
          <tr>
            <th className="text-left px-5 py-3.5 font-semibold">Usuario (Discord)</th>
            <th className="text-left px-5 py-3.5 font-semibold">Personaje a logear</th>
            <th className="text-left px-5 py-3.5 font-semibold">Clase / Spec</th>
            <th className="text-left px-5 py-3.5 font-semibold">ilvl</th>
            {showStatus && <th className="text-left px-5 py-3.5 font-semibold">Estado</th>}
            {onRemove && <th className="px-5 py-3.5" />}
          </tr>
        </thead>

        {groups.map((group) => (
          <tbody key={group.role}>
            <tr>
              <td colSpan={columnCount} className="px-5 pt-4 pb-2 border-t border-line">
                <div className="flex items-center gap-2.5">
                  <RoleIcon role={group.role} size={20} />
                  <span
                    className="text-xs font-bold uppercase tracking-wide"
                    style={{ color: ROLE_COLORS[group.role] }}
                  >
                    {ROLE_LABELS[group.role]}
                  </span>
                  <span className="font-data text-xs text-ink-faint">{group.entries.length}</span>
                </div>
              </td>
            </tr>
            {group.entries.map((s, index) => {
              const color = classColor(s.candidate.class);
              const isMine = myCharacterIds?.has(s.candidate.id) ?? false;
              return (
                <tr
                  key={s.candidate.id}
                  className="border-t border-line hover:bg-[color:var(--color-surface-2)] transition-colors cascade-item"
                  style={{
                    borderLeft: `3px solid ${color}`,
                    ...cascadeStyle(index),
                    ...(isMine
                      ? {
                          outline: "2px solid var(--color-gold)",
                          outlineOffset: "-2px",
                          boxShadow: "0 0 10px 1px color-mix(in srgb, var(--color-gold) 55%, transparent)",
                        }
                      : {}),
                  }}
                >
                  <td className="px-5 py-3 text-ink-muted">{s.candidate.discord_username}</td>
                  <td className="px-5 py-3 font-semibold text-ink">
                    {capitalize(s.candidate.name)}
                    <span className="text-ink-faint font-normal">-{s.candidate.realm_slug}</span>
                  </td>
                  <td className="px-5 py-3" style={{ color }}>
                    <span className="inline-flex items-center gap-1.5">
                      {shortSpec(s.candidate.class, s.candidate.specUsed ?? s.candidate.active_spec)}
                      {s.candidate.isOffSpec && <OffSpecBadge />}
                      {s.candidate.isDayOff && <OvertimeBadge />}
                    </span>
                  </td>
                  <td className="px-5 py-3 font-data font-bold" style={{ color: "var(--color-gold)" }}>
                    {s.candidate.ilvl}
                  </td>
                  {showStatus && (
                    <td className="px-5 py-3">
                      <span
                        className="text-xs font-semibold px-2 py-0.5 rounded-full"
                        style={{
                          color: s.isSaved ? "var(--color-danger)" : "var(--color-success)",
                          backgroundColor: s.isSaved
                            ? "color-mix(in srgb, var(--color-danger) 14%, transparent)"
                            : "color-mix(in srgb, var(--color-success) 14%, transparent)",
                        }}
                      >
                        {s.isSaved ? "Saved" : "Unsaved"}
                      </span>
                    </td>
                  )}
                  {onRemove && (
                    <td className="px-5 py-3">
                      <div className="flex justify-end">
                        <IconAction
                          icon={X}
                          label="Quitar del roster"
                          onClick={() => onRemove(s.candidate.id)}
                          className="hover:text-[color:var(--color-danger)]"
                        />
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        ))}

        {groups.length === 0 && (
          <tbody>
            <tr>
              <td colSpan={columnCount} className="px-5 py-10 text-center text-ink-faint">
                Todavía no agregaste a nadie.
              </td>
            </tr>
          </tbody>
        )}
      </table>
    </div>
  );
}
