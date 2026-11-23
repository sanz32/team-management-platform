"use client";

import { Fragment, createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { X, RotateCw, Pencil, Star, Users, Swords, Gauge, ShieldCheck, Copy, Check, GripVertical, Settings2 } from "lucide-react";
import { capitalize } from "@/lib/format";
import type { WeeklyDungeonScore } from "@/lib/season-dungeon-pool";
import {
  formatRating,
  formatKeystone,
  summarizeVault,
  hasVaultData,
  type CharacterCurrency,
  type CharacterVaultSlot,
  type DelveBounty,
} from "@/lib/sync-display";
import { classColor, classGlow, classBannerUrl, shortSpec, ALL_CLASSES } from "@/lib/wow-classes";
import {
  ROSTER_TIERS,
  ROSTER_TIER_HINTS,
  ROSTER_TIER_LABELS,
  type CharacterTier,
} from "@/lib/roster-tiers";
import { factionColor, factionLabel, factionBannerUrl } from "@/lib/faction";
import { bossKey, raidHeaderImagePosition, RaidDef, Difficulty, TRACKED_LOCKOUT_DIFFICULTIES } from "@/lib/raids";
import RaidUnsavedRow from "@/app/components/RaidUnsavedRow";
import VaultMeter from "@/app/components/VaultMeter";
import { useRefetchOnReturn } from "@/lib/useRefetchOnReturn";
import { sortCharacters } from "@/lib/characters-sort";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DraggableAttributes,
  type DraggableSyntheticListeners,
} from "@dnd-kit/core";
import {
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useConfirm } from "../../components/ConfirmDialogProvider";
import { useToast } from "@/app/components/ToastProvider";
import SpecSelectionModal from "../../components/SpecSelectionModal";
import { useBlizzardImport, BlizzardSyncButton, BlizzardImportResults } from "../../components/BlizzardImportPanel";
import IconBadge from "../../components/dashboard/IconBadge";
import LockoutFreshnessIndicator, {
  notifyLockoutsRefreshStarted,
  notifyLockoutsRefreshed,
} from "../../components/LockoutFreshnessIndicator";
import PillToggle from "../../components/PillToggle";
import BossThumb from "../../components/BossThumb";
import RaidCoverageSection from "./RaidCoverageSection";
import GuildTableView from "./GuildTableView";
import MemberAvatar, { memberAccent, memberNameProps } from "./MemberAvatar";
import SegmentedToggle from "../../components/SegmentedToggle";
import { CascadeScope, Section, Reveal, useCascadeFreeze, useCascadeSlot } from "./Section";
import {
  countCharactersForGoal,
  computeAverageIlvl,
  ilvlGoalUsesMains,
  ilvlGoalTopN,
  worstDebtForUser,
  GOAL_TYPE_LABELS,
  type GoalTarget,
  type MemberGoalDebt,
} from "@/lib/goal-progress";
import GoalDebtBadge from "../../components/GoalDebtBadge";
import { characterTooltip } from "./character-tooltip";
import { buildWowAccountLabels, type WowAccountLabel } from "@/lib/wow-accounts";
import TierSetBadge from "@/app/components/TierSetBadge";
import type { TierSetGroup } from "@/lib/tier-set";
import PageHeader from "@/app/components/PageHeader";
import { readJsonBody } from "@/lib/read-json";
import LoadingState from "@/app/components/LoadingState";
import { cachedJson, invalidateCache, readCache } from "@/lib/data-cache";
import AdminCurrenciesPanel from "./AdminCurrenciesPanel";
import AdminGoalsPanel from "./GoalsAdmin";
import GoalDeadlineNote from "@/app/components/GoalDeadlineNote";

interface CharacterSpec {
  name: string;
  role: string;
}

export interface Character {
  id: string;
  name: string;
  realm_slug: string;
  region: string;
  class: string | null;
  active_spec: string | null;
  role: string | null;
  faction: string | null;
  realm_name: string | null;
  ilvl: number | null;
  level: number | null;
  tier_piece_count: number | null;
  tier_set_name: string | null;
  tier_pieces: TierSetGroup[] | null;
  last_updated: string | null;
  wow_account_number: number | null;
  user_id?: string;
  app_users?: { discord_username: string | null } | null;
  kills: string[];
  specs: CharacterSpec[];
  is_main: boolean;
  sort_order: number | null;
  roster_tier: CharacterTier | null;
  roster_note: string | null;
  gold: number | null;
  mythic_plus_rating: number | null;
  mythic_plus_keystone: unknown;
  mythic_plus_dungeons: WeeklyDungeonScore[] | null;
  delve_bounty: DelveBounty | null;
  currencies: CharacterCurrency[];
  vault: CharacterVaultSlot[];
  desktop_synced_at: string | null;
  gg_observed_at?: string | null;
}

type SpecModalState =
  | {
      mode: "add";
      wowClass: string | null;
      pending: { name: string; realm_slug: string; region: string; faction: string | null };
    }
  | {
      mode: "edit";
      wowClass: string | null;
      initialSpecs: string[];
      characterId: string;
    };

export interface LockoutsResponse {
  characters?: Character[];
  members?: OwnerGroup[];
  syncedSeasonId?: number | null;
  myUserId?: string | null;
  hasMochila?: boolean;
  goals?: GoalTarget[];
  goalDebts?: MemberGoalDebt[];
  mainClassesByUser?: Record<string, string[]>;
  currencyIcons?: Record<number, string>;
  vaultItemIcons?: Record<number, string>;
}

export interface OwnerGroup {
  user_id: string;
  discord_username: string;
  avatar_url: string | null;
  has_mochila: boolean;
  mochila_count: number;
  has_app: boolean;
  frame_color_1: string | null;
  frame_color_2: string | null;
  frame_name_style: string | null;
  characters: Character[];
}

function MemberRow({
  group,
  isSelected,
  onSelect,
  debt,
}: {
  group: OwnerGroup;
  isSelected: boolean;
  onSelect: () => void;
  debt: MemberGoalDebt | null;
}) {
  const [cascadeRef, cascadeClass, cascadeDelay] = useCascadeSlot<HTMLButtonElement>();
  const accent = memberAccent(group.user_id);
  const memberIlvl = averageIlvl(group.characters);
  const nameProps = memberNameProps(
    group.has_app,
    group.frame_name_style as "gradient" | "solid" | "none" | null,
    group.frame_color_1,
    group.frame_color_2
  );
  return (
    <button
      ref={cascadeRef}
      type="button"
      onClick={onSelect}
      className={`w-full flex items-center gap-3 pl-3 pr-3 py-2.5 rounded-lg text-left transition-colors ${cascadeClass}`}
      style={{
        ...cascadeDelay,
        backgroundColor: isSelected ? "var(--color-surface-2)" : "transparent",
        borderLeft: `2px solid ${isSelected ? accent : "transparent"}`,
      }}
    >
      <MemberAvatar
        group={group}
        size={34}
        hasApp={group.has_app}
        accent1={group.frame_color_1}
        accent2={group.frame_color_2}
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 min-w-0">
          <span
            className={`truncate text-sm font-semibold ${nameProps?.className ?? ""}`}
            style={nameProps ? nameProps.style : { color: isSelected ? "var(--color-ink)" : "var(--color-ink-muted)" }}
          >
            {group.discord_username}
          </span>
          <GoalDebtBadge debt={debt} />
        </span>
        <span className="block font-data text-micro text-ink-faint mt-0.5">
          {group.characters.length} pj
          {memberIlvl !== null && ` · ilvl ${memberIlvl}`}
        </span>
      </span>
    </button>
  );
}

function copyDisplayName(character: Character): string {
  const realm = character.realm_name ? character.realm_name.replace(/\s+/g, "") : character.realm_slug;
  return `${capitalize(character.name)}-${realm}`;
}

function isRaidKilledAtDifficulty(character: Character, raid: RaidDef, difficulty: Difficulty): boolean {
  return raid.bosses.some((_, i) => character.kills.includes(bossKey(raid.key, difficulty, i + 1)));
}

function parseArmoryLink(url: string) {
  const match = url.match(/character\/(us|eu|kr|tw)\/([a-z0-9-]+)\/([^\/?#]+)/i);
  if (!match) return null;

  const [, region, realmSlug, rawName] = match;
  return {
    region: region.toLowerCase(),
    realmSlug: realmSlug.toLowerCase(),
    name: decodeURIComponent(rawName),
  };
}

type RefreshScope = "lockouts" | "armory" | "all";

const REFRESH_SCOPE_LABEL: Record<RefreshScope, string> = {
  lockouts: "Lockouts",
  armory: "Armory",
  all: "todo",
};

const REFRESH_SCOPES: RefreshScope[] = ["lockouts", "armory", "all"];

const REFRESH_BUTTON_LABEL: Record<RefreshScope, string> = {
  lockouts: "Lockouts",
  armory: "Armory",
  all: "Todo",
};

function RefreshActions({
  refreshingScope,
  onRefresh,
}: {
  refreshingScope: RefreshScope | null;
  onRefresh: (scope: RefreshScope) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-data text-micro uppercase tracking-[0.18em] text-ink-faint mr-0.5">
        Actualizar
      </span>
      {REFRESH_SCOPES.map((scope) => (
        <button
          key={scope}
          onClick={() => onRefresh(scope)}
          disabled={refreshingScope !== null}
          className={`btn ${scope === "all" ? "btn-primary" : "btn-secondary"}`}
        >
          <RotateCw className={`w-3.5 h-3.5 ${refreshingScope === scope ? "animate-spin" : ""}`} />
          {REFRESH_BUTTON_LABEL[scope]}
        </button>
      ))}
    </div>
  );
}

function BlockLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-data text-micro uppercase tracking-[0.12em] text-ink-faint shrink-0">
      {children}
    </span>
  );
}


const DIFFICULTY_FULL_LABEL: Partial<Record<Difficulty, string>> = {
  normal: "Normal",
  heroic: "Heroico",
  mythic: "Mítico",
};

function LockoutCell({ raid, difficulty, character }: { raid: RaidDef; difficulty: Difficulty; character: Character }) {
  if (!raid.difficulties.includes(difficulty)) {
    return <span className="text-ink-faint/40 text-label text-center">—</span>;
  }
  const saved = isRaidKilledAtDifficulty(character, raid, difficulty);
  const color = saved ? "var(--color-danger)" : "var(--color-success)";
  const difficultyLabel = DIFFICULTY_FULL_LABEL[difficulty];
  return (
    <span
      title={`${raid.name} (${difficultyLabel}) — ${saved ? "Saveado" : "Libre"}`}
      className="rounded text-label font-semibold text-center py-0.5"
      style={{
        color,
        backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
      }}
    >
      {raid.abbr}
    </span>
  );
}

const SyncedSeasonContext = createContext<number | null>(null);

const RaidsContext = createContext<RaidDef[]>([]);

function WeeklyStatus({ character }: { character: Character }) {
  const raids = useContext(RaidsContext);

  return (
    <div className="flex flex-col">
      <div>
        <BlockLabel>Lockouts</BlockLabel>
        <div
          className="grid gap-x-1 gap-y-0.5 items-center mt-0.5"
          style={{ gridTemplateColumns: `auto repeat(${raids.length}, minmax(0, 1fr)) auto` }}
        >
          {TRACKED_LOCKOUT_DIFFICULTIES.map((difficulty) => (
            <Fragment key={difficulty}>
              <span className="font-data text-micro text-ink-muted pr-1 justify-self-end">
                {DIFFICULTY_LABEL[difficulty]}
              </span>
              {raids.map((raid) => (
                <LockoutCell key={raid.key} raid={raid} difficulty={difficulty} character={character} />
              ))}
              <span aria-hidden className="invisible font-data text-micro pl-1">
                {DIFFICULTY_LABEL[difficulty]}
              </span>
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}

function HeaderIlvl({ character }: { character: Character }) {
  return (
    <div className="shrink-0 mr-6 flex items-end gap-1.5">
      <div className="text-right">
        <p className="font-data text-micro uppercase tracking-[0.12em] text-ink-faint leading-none">
          ilvl
        </p>
        <span
          className="font-data font-bold text-lg leading-none block mt-1"
          style={{ color: character.ilvl != null ? "var(--color-gold)" : "var(--color-ink)" }}
        >
          {character.ilvl ?? "—"}
        </span>
      </div>
      <TierSetBadge
        count={character.tier_piece_count}
        sets={character.tier_pieces}
        legacySetName={character.tier_set_name}
      />
    </div>
  );
}

export default function CharactersClient({
  canSeeAll,
  canManage,
  initialViewMode,
  initialMemberId,
}: {
  canSeeAll: boolean;
  canManage: boolean;
  initialViewMode?: "admin" | "personal";
  initialMemberId?: string | null;
}) {
  const confirm = useConfirm();
  const toast = useToast();
  const [viewMode, setViewMode] = useState<"admin" | "personal">(
    initialViewMode === "admin" && canSeeAll ? "admin" : "personal"
  );

  const [characters, setCharacters] = useState<Character[]>([]);
  const [members, setMembers] = useState<OwnerGroup[]>([]);
  const [goals, setGoals] = useState<GoalTarget[]>([]);
  const [goalsLoaded, setGoalsLoaded] = useState(false);
  const [goalDebts, setGoalDebts] = useState<MemberGoalDebt[]>([]);
  const [mainClassesByUser, setMainClassesByUser] = useState<Record<string, string[]>>({});
  const [syncedSeasonId, setSyncedSeasonId] = useState<number | null>(null);
  const [raids, setRaids] = useState<RaidDef[]>([]);
  const [loadingMine, setLoadingMine] = useState(true);
  const [loadingAll, setLoadingAll] = useState(canSeeAll);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [myHasMochila, setMyHasMochila] = useState(false);

  const [refreshingScope, setRefreshingScope] = useState<RefreshScope | null>(null);
  const [refreshProgress, setRefreshProgress] = useState<{ done: number; total: number } | null>(
    null
  );
  const [refreshError, setRefreshError] = useState("");

  const [showAddForm, setShowAddForm] = useState(false);
  const [armoryLink, setArmoryLink] = useState("");
  const [linkError, setLinkError] = useState("");
  const [addingFromLink, setAddingFromLink] = useState(false);
  const [form, setForm] = useState({ name: "", realm_slug: "", region: "us", class: "", faction: "" });
  const [specModal, setSpecModal] = useState<SpecModalState | null>(null);

  const [memberSearch, setMemberSearch] = useState("");
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(initialMemberId ?? null);
  const [classFilter, setClassFilter] = useState("all");

  function applyMine(data: LockoutsResponse) {
    setCharacters(data.characters ?? []);
    setSyncedSeasonId(data.syncedSeasonId ?? null);
    setMyUserId(data.myUserId ?? null);
    setMyHasMochila(data.hasMochila ?? false);
  }

  async function loadMine() {
    if (!readCache("/api/lockouts")) setLoadingMine(true);
    const data = await cachedJson<LockoutsResponse>("/api/lockouts", { onRevalidated: applyMine });
    if (data) applyMine(data);
    setLoadingMine(false);
  }

  async function patchUserFlag(
    userId: string,
    flag: "hasMochila",
    value: boolean
  ): Promise<boolean> {
    const res = await fetch(`/api/users/${userId}/flags`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ flag, value }),
    });
    return res.ok;
  }

  async function handleToggleMochila(userId: string, value: boolean) {
    if (!(await patchUserFlag(userId, "hasMochila", value))) return;
    if (userId === myUserId) setMyHasMochila(value);
    setMembers((prev) => prev.map((g) => (g.user_id === userId ? { ...g, has_mochila: value } : g)));
    invalidateCache("/api/lockouts");
  }

  async function handleSetRosterTier(characterId: string, tier: CharacterTier) {
    const res = await fetch(`/api/characters/${characterId}/roster-tier`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tier }),
    });
    if (!res.ok) return;
    setMembers((prev) =>
      prev.map((g) => ({
        ...g,
        characters: g.characters.map((c) =>
          c.id === characterId ? { ...c, roster_tier: tier } : c
        ),
      }))
    );
    invalidateCache("/api/lockouts");
  }

  function applyAll(data: LockoutsResponse) {
    setMembers(data.members ?? []);
    setSyncedSeasonId(data.syncedSeasonId ?? null);
    setGoals(data.goals ?? []);
    setGoalsLoaded(true);
    setGoalDebts(data.goalDebts ?? []);
    setMainClassesByUser(data.mainClassesByUser ?? {});
  }

  async function loadAll() {
    if (!readCache("/api/lockouts?all=true")) setLoadingAll(true);
    const data = await cachedJson<LockoutsResponse>("/api/lockouts?all=true", { onRevalidated: applyAll });
    if (data) applyAll(data);
    setLoadingAll(false);
  }

  async function loadRaidCatalog() {
    const data = await cachedJson<{ raids?: RaidDef[] }>("/api/raids", { ttlMs: 10 * 60_000 });
    if (data) setRaids(data.raids ?? []);
  }

  const parsedLink = armoryLink ? parseArmoryLink(armoryLink) : null;

  async function reloadLists() {
    await Promise.all([loadMine(), canSeeAll ? loadAll() : Promise.resolve(), loadRaidCatalog()]);
  }

  async function refreshBothLists() {
    invalidateCache("/api/lockouts");
    await reloadLists();
  }

  useRefetchOnReturn(reloadLists);

  async function previewCharacter(name: string, realm_slug: string, region: string) {
    const res = await fetch("/api/characters/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, realm_slug, region }),
    });
    const data = await readJsonBody(res);
    return {
      found: !!data.found,
      class: (data.class as string | null) ?? null,
      faction: (data.faction as string | null) ?? null,
    };
  }

  async function handleAddFromLink() {
    if (!parsedLink) return;
    setAddingFromLink(true);
    setLinkError("");
    try {
      const preview = await previewCharacter(parsedLink.name, parsedLink.realmSlug, parsedLink.region);
      if (!preview.found) {
        setLinkError(
          "No se encontró ese personaje en el Armory ahora mismo. Usa el formulario manual de abajo (elige también su clase)."
        );
        return;
      }
      setSpecModal({
        mode: "add",
        wowClass: preview.class,
        pending: {
          name: parsedLink.name,
          realm_slug: parsedLink.realmSlug,
          region: parsedLink.region,
          faction: preview.faction,
        },
      });
    } finally {
      setAddingFromLink(false);
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const preview = await previewCharacter(form.name, form.realm_slug, form.region);
    const resolvedClass = preview.found ? preview.class : form.class || null;
    const resolvedFaction = preview.found ? preview.faction : form.faction || null;
    setSpecModal({
      mode: "add",
      wowClass: resolvedClass,
      pending: { name: form.name, realm_slug: form.realm_slug, region: form.region, faction: resolvedFaction },
    });
  }

  async function handleSpecConfirm(specNames: string[], resolvedClass: string) {
    if (!specModal) return;

    if (specModal.mode === "add") {
      const res = await fetch("/api/characters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...specModal.pending, class: resolvedClass, specNames }),
      });
      const data = await readJsonBody(res);
      if (!res.ok) {
        toast.error("No se pudo agregar el personaje", data.error || undefined);
        return;
      }
      if (data.warning) toast.info("Personaje agregado", data.warning);
      else toast.success("Personaje agregado");
      setArmoryLink("");
      setForm({ name: "", realm_slug: "", region: "us", class: "", faction: "" });
      setShowAddForm(false);
      setSpecModal(null);
      await refreshBothLists();
    } else {
      const res = await fetch(`/api/characters/${specModal.characterId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ specNames, class: resolvedClass }),
      });
      const data = await readJsonBody(res);
      if (!res.ok) {
        toast.error("No se pudo guardar la especialización", data.error || undefined);
        return;
      }
      toast.success("Especialización actualizada");
      setSpecModal(null);
      await refreshBothLists();
    }
  }

  function openEditSpecs(character: Character) {
    setSpecModal({
      mode: "edit",
      wowClass: character.class,
      initialSpecs: character.specs?.length
        ? character.specs.map((s) => s.name)
        : character.active_spec
          ? [character.active_spec]
          : [],
      characterId: character.id,
    });
  }

  async function handleRefreshMine(scope: RefreshScope) {
    setRefreshingScope(scope);
    setRefreshError("");
    const touchesLockouts = scope === "lockouts" || scope === "all";
    if (touchesLockouts) notifyLockoutsRefreshStarted();
    try {
      const res = await fetch("/api/characters/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope }),
      });
      if (!res.ok) {
        const err = await readJsonBody(res).catch(() => ({}));
        throw new Error(err.error || "No se pudo refrescar tus personajes.");
      }

      if (touchesLockouts) {
        const wclRes = await fetch("/api/lockouts/refresh-wcl", { method: "POST" });
        if (!wclRes.ok) {
          const wclErr = await wclRes.json().catch(() => ({}));
          throw new Error(
            wclErr.error || "Se refrescaron tus personajes pero falló la detección de Sporefall vía Warcraft Logs."
          );
        }
      }

      await refreshBothLists();
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudo refrescar tus personajes.";
      setRefreshError(message);
    } finally {
      setRefreshingScope(null);
      if (touchesLockouts) notifyLockoutsRefreshed();
    }
  }

  async function handleRefreshAll(scope: RefreshScope) {
    setRefreshingScope(scope);
    setRefreshError("");
    setRefreshProgress(null);
    const BATCH_SIZE = 15;
    const touchesLockouts = scope === "lockouts" || scope === "all";
    if (touchesLockouts) notifyLockoutsRefreshStarted();

    try {
      const listRes = await fetch("/api/characters?all=true");
      if (!listRes.ok) throw new Error("No se pudo obtener la lista del guild.");
      const listData = await listRes.json();
      const allIds: string[] = (listData.characters ?? []).map((c: Character) => c.id);

      setRefreshProgress({ done: 0, total: allIds.length });

      for (let i = 0; i < allIds.length; i += BATCH_SIZE) {
        const batch = allIds.slice(i, i + BATCH_SIZE);
        const res = await fetch("/api/characters/refresh", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ all: true, characterIds: batch, scope }),
        });
        if (!res.ok) {
          const err = await readJsonBody(res).catch(() => ({}));
          throw new Error(
            err.error || `Se cortó al refrescar (llevaba ${i} de ${allIds.length} personajes).`
          );
        }
        setRefreshProgress({ done: Math.min(i + batch.length, allIds.length), total: allIds.length });
      }

      if (touchesLockouts) {
        const wclRes = await fetch("/api/lockouts/refresh-wcl", { method: "POST" });
        if (!wclRes.ok) {
          const err = await wclRes.json().catch(() => ({}));
          throw new Error(
            err.error || "Se refrescó el guild pero falló la detección de Sporefall vía Warcraft Logs."
          );
        }
      }

      await refreshBothLists();
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudo refrescar el guild completo.";
      setRefreshError(message);
    } finally {
      setRefreshingScope(null);
      setRefreshProgress(null);
      if (touchesLockouts) notifyLockoutsRefreshed();
    }
  }

  async function handleDelete(id: string, name: string) {
    const confirmed = await confirm(
      `¿Seguro que quieres eliminar a "${name}"? Esta acción no se puede deshacer.`,
      { danger: true, confirmLabel: "Eliminar" }
    );
    if (!confirmed) return;

    const res = await fetch(`/api/characters/${id}`, { method: "DELETE" });
    if (res.ok) {
      setCharacters((prev) => prev.filter((c) => c.id !== id));
      setMembers((prev) => prev.map((g) => ({ ...g, characters: g.characters.filter((c) => c.id !== id) })));
      invalidateCache("/api/lockouts");
      toast.success("Personaje eliminado");
    } else {
      const err = await readJsonBody(res);
      toast.error("No se pudo eliminar el personaje", err.error || undefined);
    }
  }

  function handleReorder(orderedIds: string[]) {
    setCharacters((prev) => {
      const byId = new Map(prev.map((c) => [c.id, c]));
      const reordered = orderedIds
        .map((id, index): Character | null => {
          const character = byId.get(id);
          return character ? { ...character, sort_order: index } : null;
        })
        .filter((c): c is Character => c !== null);
      return reordered.length === prev.length ? reordered : prev;
    });

    fetch("/api/characters/reorder", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ characterIds: orderedIds }),
    })
      .then(() => invalidateCache("/api/lockouts"))
      .catch((err) => console.error("Error guardando el nuevo orden de personajes:", err));
  }

  function toggleViewMode() {
    const next = viewMode === "admin" ? "personal" : "admin";
    if (next === "admin" && members.length === 0 && !loadingAll) loadAll();
    setViewMode(next);
  }

  return (
    <SyncedSeasonContext.Provider value={syncedSeasonId}>
    <RaidsContext.Provider value={raids}>
    <div>
      <PageHeader
        eyebrow="Progresión"
        icon={Users}
        title="Personajes"
        description={
          viewMode === "admin"
            ? "Todo el roster del guild, miembro por miembro."
            : "Tu main, lockouts de la semana y todos tus personajes"
        }
        actions={
          <>
            <LockoutFreshnessIndicator onRefreshComplete={refreshBothLists} />
        <div className="flex flex-wrap items-center gap-2">
          {canSeeAll && (
            <button onClick={toggleViewMode} className="btn btn-secondary">
              {viewMode === "admin" ? "Mi vista personal" : "Guild"}
            </button>
          )}
          {(viewMode === "personal" || canManage) && canSeeAll && (
            <span className="w-px h-7 mx-1 shrink-0 bg-line" aria-hidden />
          )}
          {viewMode === "admin"
            ? canManage && (
                <RefreshActions refreshingScope={refreshingScope} onRefresh={handleRefreshAll} />
              )
            : <RefreshActions refreshingScope={refreshingScope} onRefresh={handleRefreshMine} />}
        </div>
          </>
        }
      />

      {refreshProgress && (
        <div className="card p-4 mb-4">
          <div className="flex items-center justify-between text-xs text-ink-muted mb-2">
            <span>
              Actualizando {refreshingScope ? REFRESH_SCOPE_LABEL[refreshingScope] : ""} del guild:{" "}
              {refreshProgress.done} / {refreshProgress.total} personajes
            </span>
            <span>
              {refreshProgress.total > 0
                ? Math.round((refreshProgress.done / refreshProgress.total) * 100)
                : 0}
              %
            </span>
          </div>
          <div
            className="h-2 rounded-full overflow-hidden"
            style={{ backgroundColor: "var(--color-surface-2)" }}
          >
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${
                  refreshProgress.total > 0 ? (refreshProgress.done / refreshProgress.total) * 100 : 0
                }%`,
                background: "linear-gradient(90deg, var(--color-primary), var(--color-secondary))",
              }}
            />
          </div>
        </div>
      )}

      {refreshError && (
        <div
          className="text-sm rounded-xl p-4 mb-4"
          style={{
            backgroundColor: "color-mix(in srgb, var(--color-danger) 12%, transparent)",
            border: "1px solid color-mix(in srgb, var(--color-danger) 35%, transparent)",
            color: "var(--color-danger)",
          }}
        >
          {refreshError}
        </div>
      )}

      {viewMode === "admin" ? (
        <AdminView
          loading={loadingAll}
          members={members}
          memberSearch={memberSearch}
          setMemberSearch={setMemberSearch}
          selectedMemberId={selectedMemberId}
          setSelectedMemberId={setSelectedMemberId}
          scrollToSelectedMember={!!initialMemberId}
          canManage={canManage}
          onDelete={canManage ? handleDelete : undefined}
          onEditSpecs={canManage ? openEditSpecs : undefined}
          onCurrenciesChanged={refreshBothLists}
          onToggleMochila={handleToggleMochila}
          onSetRosterTier={canManage ? handleSetRosterTier : undefined}
          goals={goals}
          goalsLoaded={goalsLoaded}
          onGoalsSaved={setGoals}
          goalDebts={goalDebts}
          onGoalDebtsUpdated={setGoalDebts}
          mainClassesByUser={mainClassesByUser}
        />
      ) : (
        <PersonalView
          loading={loadingMine}
          characters={characters}
          showAddForm={showAddForm}
          setShowAddForm={setShowAddForm}
          armoryLink={armoryLink}
          setArmoryLink={setArmoryLink}
          parsedLink={parsedLink}
          linkError={linkError}
          setLinkError={setLinkError}
          addingFromLink={addingFromLink}
          onAddFromLink={handleAddFromLink}
          form={form}
          setForm={setForm}
          onAddManual={handleAdd}
          classFilter={classFilter}
          setClassFilter={setClassFilter}
          onDelete={handleDelete}
          onEditSpecs={openEditSpecs}
          onCharactersImported={refreshBothLists}
          onReorder={handleReorder}
          hasMochila={myHasMochila}
          onToggleMochila={(v) => myUserId && handleToggleMochila(myUserId, v)}
        />
      )}

      {specModal && (
        <SpecSelectionModal
          wowClass={specModal.wowClass}
          initialSpecs={specModal.mode === "edit" ? specModal.initialSpecs : []}
          onConfirm={handleSpecConfirm}
          onCancel={() => setSpecModal(null)}
        />
      )}
    </div>
    </RaidsContext.Provider>
    </SyncedSeasonContext.Provider>
  );
}

function StatTile({
  icon,
  color,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  color: string;
  label: string;
  value: string | number;
}) {
  return (
    <div className="card p-5 flex items-start gap-4">
      <IconBadge icon={icon} color={color} />
      <div className="min-w-0">
        <p className="font-data text-micro uppercase tracking-[0.16em] text-ink-faint truncate">
          {label}
        </p>
        <p className="font-data font-bold text-ink leading-none mt-2.5 text-[clamp(1.9rem,2.5vw,2.6rem)]">
          {value}
        </p>
      </div>
    </div>
  );
}

const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  world: "MU",
  normal: "N",
  heroic: "HC",
  mythic: "M",
};

interface BossUnsavedEntry {
  raidKey: string;
  bossIndex: number;
  bossName: string;
  imageUrl: string | null;
  color: string;
  count: number;
}

function unsavedByDifficultyForMemberByBoss(
  characters: Character[],
  allRaids: RaidDef[]
): { difficulty: Difficulty; bosses: BossUnsavedEntry[] }[] {
  const difficulties = TRACKED_LOCKOUT_DIFFICULTIES;
  return difficulties.map((difficulty) => ({
    difficulty,
    bosses: allRaids
      .filter((raid) => raid.difficulties.includes(difficulty))
      .flatMap((raid) =>
        raid.bosses.map((boss, index) => ({
          raidKey: raid.key,
          bossIndex: index,
          bossName: boss.name,
          imageUrl: boss.imageUrl,
          color: raid.color,
          count: characters.filter((c) => !c.kills.includes(bossKey(raid.key, difficulty, index + 1))).length,
        }))
      ),
  }));
}

function unsavedBossFilterKey(difficulty: Difficulty, raidKey: string, bossIndex: number): string {
  return `${difficulty}:${raidKey}:${bossIndex}`;
}

function UnsavedBossChip({
  bossName,
  imageUrl,
  color,
  count,
  active: filterActive,
  onClick,
}: {
  bossName: string;
  imageUrl: string | null;
  color: string;
  count: number;
  active?: boolean;
  onClick?: () => void;
}) {
  const hasUnsaved = count > 0;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative shrink-0 rounded-lg transition-transform ${
        onClick ? "cursor-pointer hover:scale-[1.06]" : "cursor-default"
      }`}
      title={onClick ? `${bossName} -- ${count} Unsaved -- clic para filtrar` : `${bossName} -- ${count} Unsaved`}
      style={{
        boxShadow: filterActive
          ? "0 0 0 2.5px var(--color-primary)"
          : `0 0 0 2px ${hasUnsaved ? color : "var(--color-line)"}`,
      }}
    >
      <BossThumb imageUrl={imageUrl} width={72} height={36} />
      <span
        className="absolute -bottom-2 -right-2 flex items-center justify-center min-w-[22px] h-[22px] px-[4px] rounded-full font-data font-bold text-label leading-none"
        style={{
          backgroundColor: filterActive ? "var(--color-primary)" : hasUnsaved ? color : "var(--color-surface-2)",
          color: filterActive || hasUnsaved ? "var(--color-canvas)" : "var(--color-ink-faint)",
          border: "2px solid var(--color-surface)",
        }}
      >
        {count}
      </span>
    </button>
  );
}

function UnsavedRaidBossCard({
  raid,
  rows,
  characters,
  activeFilters,
  onToggleFilter,
}: {
  raid: RaidDef;
  rows: { difficulty: Difficulty; bosses: BossUnsavedEntry[] }[];
  characters: Character[];
  activeFilters?: Set<string>;
  onToggleFilter?: (filterKey: string) => void;
}) {
  if (rows.length === 0) return null;
  return (
    <div
      className="card card-glow overflow-hidden flex flex-col flex-1 basis-0 min-w-[min(100%,20rem)]"
      style={{ "--card-glow": `color-mix(in srgb, ${raid.color} 35%, transparent)` } as React.CSSProperties}
    >
      <div
        className="h-36 shrink-0 relative flex items-end p-4"
        style={{
          backgroundImage: raid.headerImageUrl
            ? `linear-gradient(180deg, rgba(10,10,14,0.05) 0%, rgba(10,10,14,0.92) 100%), url(${raid.headerImageUrl})`
            : `linear-gradient(160deg, color-mix(in srgb, ${raid.color} 40%, var(--color-surface-2)), var(--color-surface-2))`,
          backgroundSize: "cover",
          backgroundPosition: raidHeaderImagePosition(raid.key),
        }}
      >
        <div className="min-w-0">
          <span
            className="font-data text-micro uppercase tracking-[0.18em] block mb-1"
            style={{ color: raid.color }}
          >
            {raid.abbr}
          </span>
          <h3 className="font-heading text-xl font-bold text-white drop-shadow-md leading-tight truncate">
            {raid.name}
          </h3>
        </div>
      </div>

      <div className="flex flex-col">
        {rows.map((row, rowIndex) => (
          <div
            key={row.difficulty}
            className={`flex items-center gap-4 p-4 ${rowIndex > 0 ? "border-t border-line" : ""}`}
          >
            <div className="shrink-0 w-16">
              <span className="font-data text-micro uppercase tracking-[0.16em] text-ink-faint block">
                {DIFFICULTY_LABEL[row.difficulty]}
              </span>
              <span
                className="font-data font-bold text-2xl leading-none block mt-1.5"
                style={{
                  color:
                    raidUnsavedCharacterCountForDifficulty(characters, raid, row.difficulty) > 0
                      ? raid.color
                      : "var(--color-ink-faint)",
                }}
              >
                {raidUnsavedCharacterCountForDifficulty(characters, raid, row.difficulty)}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 min-w-0">
              {row.bosses.map((b) => {
                const filterKey = unsavedBossFilterKey(row.difficulty, b.raidKey, b.bossIndex);
                return (
                  <UnsavedBossChip
                    key={`${b.raidKey}-${b.bossIndex}`}
                    {...b}
                    active={activeFilters?.has(filterKey)}
                    onClick={onToggleFilter ? () => onToggleFilter(filterKey) : undefined}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function groupUnsavedRowsByRaid(
  rows: ReturnType<typeof unsavedByDifficultyForMemberByBoss>,
  raids: RaidDef[]
) {
  return raids.map((raid) => ({
    raid,
    rows: rows
      .map((row) => ({ difficulty: row.difficulty, bosses: row.bosses.filter((b) => b.raidKey === raid.key) }))
      .filter((row) => row.bosses.length > 0),
  }));
}

function MemberGoalsSummary({
  characters,
  goals,
  mainClasses,
  debts,
}: {
  characters: Character[];
  goals: GoalTarget[];
  mainClasses: string[] | undefined;
  debts: MemberGoalDebt[];
}) {
  if (goals.length === 0) return null;
  const mainClassSet = new Set(mainClasses ?? []);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 mb-3">
        <p className="font-data text-micro uppercase tracking-[0.16em] text-ink-faint">
          Objetivos de la semana
        </p>
        <GoalDeadlineNote offsetMinutes={goals[0]?.deadlineOffsetMinutes ?? null} />
      </div>
      <div className="flex flex-wrap items-start gap-x-8 gap-y-4">
        {goals.map((goal) => {
          const current =
            goal.goalType === "characters"
              ? countCharactersForGoal(characters, goal, mainClassSet)
              : computeAverageIlvl(characters, ilvlGoalUsesMains(goals) ? mainClassSet : undefined, ilvlGoalTopN(goals));
          const reached = current >= goal.target;
          const pct = goal.target > 0 ? Math.min(100, (current / goal.target) * 100) : 0;
          const color = reached ? "var(--color-success)" : "var(--color-primary)";
          const debt = debts.find((d) => d.goalType === goal.goalType);
          return (
            <div key={goal.goalType} className="min-w-[9rem]">
              <div className="flex items-center gap-2">
                <p className="font-data text-micro uppercase tracking-[0.14em] text-ink-faint whitespace-nowrap">
                  {GOAL_TYPE_LABELS[goal.goalType]}
                </p>
                <GoalDebtBadge debt={debt ?? null} current={current} />
              </div>
              <p className="font-data font-bold text-2xl leading-none mt-2">
                <span style={{ color: reached ? "var(--color-success)" : "var(--color-ink)" }}>
                  {current}
                </span>
                <span className="text-ink-faint font-normal text-base">/{goal.target}</span>
              </p>
              <span
                className="block h-1 rounded-full mt-2.5 overflow-hidden"
                style={{ backgroundColor: "var(--color-surface-2)" }}
              >
                <span
                  className="block h-full rounded-full transition-[width] duration-500"
                  style={{ width: `${pct}%`, backgroundColor: color }}
                />
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function raidUnsavedCharacterCountForDifficulty(
  characters: Character[],
  raid: RaidDef,
  difficulty: Difficulty
): number {
  if (!raid.difficulties.includes(difficulty)) return 0;
  return characters.filter((c) =>
    raid.bosses.some((_, index) => !c.kills.includes(bossKey(raid.key, difficulty, index + 1)))
  ).length;
}

function MemberUnsavedSummary({ characters }: { characters: Character[] }) {
  const raids = useContext(RaidsContext);
  if (characters.length === 0) return null;
  const trackedRaids = raids.filter(
    (raid) => raid.bosses.length > 0 && raid.difficulties.some((d) => TRACKED_LOCKOUT_DIFFICULTIES.includes(d))
  );
  if (trackedRaids.length === 0) return null;
  return (
    <div className="flex flex-col gap-2.5 rounded-lg border border-line p-3 flex-1 min-w-[280px]">
      <span className="text-caption !text-ink-faint">Personajes unsaved por raid</span>
      <div className="flex flex-wrap gap-3">
        {trackedRaids.map((raid) => {
          const counts = Object.fromEntries(
            TRACKED_LOCKOUT_DIFFICULTIES.filter((d) => raid.difficulties.includes(d)).map((d) => [
              d,
              raidUnsavedCharacterCountForDifficulty(characters, raid, d),
            ])
          ) as Partial<Record<Difficulty, number>>;
          return (
            <div key={raid.key} className="flex-1 min-w-[220px]">
              <RaidUnsavedRow
                raid={{
                  key: raid.key,
                  name: raid.name,
                  abbr: raid.abbr,
                  color: raid.color,
                  headerImageUrl: raid.headerImageUrl,
                  difficulties: raid.difficulties,
                  counts,
                }}
                size="lg"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function averageIlvl(characters: Character[]): number | null {
  const withIlvl = characters.filter((c) => c.ilvl);
  if (withIlvl.length === 0) return null;
  return Math.round(withIlvl.reduce((sum, c) => sum + (c.ilvl ?? 0), 0) / withIlvl.length);
}

function PersonalUnsavedPanel({
  characters,
  activeFilters,
  onToggleFilter,
}: {
  characters: Character[];
  activeFilters: Set<string>;
  onToggleFilter: (filterKey: string) => void;
}) {
  const raids = useContext(RaidsContext);
  if (characters.length === 0) return null;
  const rows = unsavedByDifficultyForMemberByBoss(characters, raids);
  const byRaid = groupUnsavedRowsByRaid(rows, raids);

  return (
    <div className="flex flex-wrap items-stretch gap-5">
      {byRaid.map(({ raid, rows: raidRows }) => (
        <UnsavedRaidBossCard
          key={raid.key}
          raid={raid}
          rows={raidRows}
          characters={characters}
          activeFilters={activeFilters}
          onToggleFilter={onToggleFilter}
        />
      ))}
    </div>
  );
}

function AdminView({
  loading,
  members,
  memberSearch,
  setMemberSearch,
  selectedMemberId,
  setSelectedMemberId,
  canManage,
  onDelete,
  onEditSpecs,
  onCurrenciesChanged,
  onToggleMochila,
  onSetRosterTier,
  goals,
  goalsLoaded,
  onGoalsSaved,
  goalDebts,
  onGoalDebtsUpdated,
  scrollToSelectedMember,
  mainClassesByUser,
}: {
  loading: boolean;
  members: OwnerGroup[];
  memberSearch: string;
  setMemberSearch: (v: string) => void;
  selectedMemberId: string | null;
  setSelectedMemberId: (v: string) => void;
  canManage: boolean;
  onDelete?: (id: string, name: string) => void;
  onEditSpecs?: (character: Character) => void;
  onCurrenciesChanged: () => void;
  goals: GoalTarget[];
  goalsLoaded: boolean;
  onGoalsSaved: (goals: GoalTarget[]) => void;
  goalDebts: MemberGoalDebt[];
  onGoalDebtsUpdated: (debts: MemberGoalDebt[]) => void;
  mainClassesByUser: Record<string, string[]>;
  onToggleMochila: (userId: string, value: boolean) => void;
  scrollToSelectedMember?: boolean;
  onSetRosterTier?: (characterId: string, tier: CharacterTier) => void;
}) {
  const filteredGroups = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    if (!q) return members;
    return members.filter((g) => g.discord_username.toLowerCase().includes(q));
  }, [members, memberSearch]);

  useEffect(() => {
    if (filteredGroups.length === 0) return;
    if (!selectedMemberId || !filteredGroups.some((g) => g.user_id === selectedMemberId)) {
      setSelectedMemberId(filteredGroups[0].user_id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredGroups]);

  const stats = useMemo(() => {
    const allCharacters = members.flatMap((m) => m.characters);
    const withIlvl = allCharacters.filter((c) => c.ilvl);
    const avgIlvl = withIlvl.length
      ? Math.round(withIlvl.reduce((s, c) => s + (c.ilvl ?? 0), 0) / withIlvl.length)
      : 0;
    const rolesCovered = new Set(allCharacters.map((c) => c.role).filter(Boolean)).size;
    return {
      members: members.length,
      total: allCharacters.length,
      avgIlvl,
      rolesCovered,
    };
  }, [members]);

  const selectedGroup = filteredGroups.find((g) => g.user_id === selectedMemberId) ?? null;

  const selectedAccountLabels = useMemo(
    () => buildWowAccountLabels((selectedGroup?.characters ?? []).map((c) => c.wow_account_number)),
    [selectedGroup]
  );

  const selectedAvgIlvl = selectedGroup ? averageIlvl(selectedGroup.characters) : null;

  const [rosterView, setRosterView] = useState<"list" | "table">("list");
  const raids = useContext(RaidsContext);

  const scrolledToMember = useRef(false);
  useEffect(() => {
    if (!scrollToSelectedMember || scrolledToMember.current) return;
    if (!selectedGroup) return;
    scrolledToMember.current = true;
    document
      .getElementById("roster-por-miembro")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [scrollToSelectedMember, selectedGroup]);

  return (
    <div>
      <Section
        eyebrow="Panorama"
        title="El guild en números"
        accent="var(--color-secondary)"
        description="Todo lo que hay registrado ahora mismo, sumando los personajes de cada miembro."
      >
        <Reveal kind="rise">
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            <StatTile icon={Users} color="var(--color-secondary)" label="Miembros" value={loading ? "—" : stats.members} />
            <StatTile icon={Swords} color="var(--color-primary)" label="Personajes" value={loading ? "—" : stats.total} />
            <StatTile icon={Gauge} color="var(--color-epic)" label="ilvl promedio" value={loading ? "—" : stats.avgIlvl || "—"} />
            <StatTile icon={ShieldCheck} color="var(--color-success)" label="Roles cubiertos" value={loading ? "—" : `${stats.rolesCovered}/3`} />
          </div>
        </Reveal>
      </Section>

      <RaidCoverageSection canManage={canManage} />

      <div id="roster-por-miembro" />
      <Section
        eyebrow="Roster"
        title={rosterView === "table" ? "Vista general" : "Miembro por miembro"}
        meta={loading ? undefined : `${members.length} miembro${members.length === 1 ? "" : "s"}`}
        accent="var(--color-epic)"
        description={
          rosterView === "table"
            ? "Todo el guild de un vistazo: cada miembro con sus personajes, su ilvl y lo que tiene libre o saveado esta semana."
            : "Elige a alguien de la lista para ver todos sus personajes, su progreso contra los objetivos del guild y lo que le queda unsaved esta semana."
        }
        actions={
          <SegmentedToggle
            options={[
              { value: "list", label: "Miembro por miembro" },
              { value: "table", label: "Vista general" },
            ]}
            value={rosterView}
            onChange={setRosterView}
            ariaLabel="Forma de ver el roster"
          />
        }
      >
        {rosterView === "table" ? (
          <GuildTableView
            members={members}
            loading={loading}
            raids={raids}
            goalDebts={goalDebts}
          />
        ) : (
        <>
        {canManage && (
          <Reveal kind="rise">
            <div className="flex flex-wrap items-start gap-x-6">
              <AdminGoalsPanel
                goals={goals}
                goalsLoaded={goalsLoaded}
                onSaved={onGoalsSaved}
                members={members}
                goalDebts={goalDebts}
                onGoalDebtsUpdated={onGoalDebtsUpdated}
                mainClassesByUser={mainClassesByUser}
              />
              <AdminCurrenciesPanel onChanged={onCurrenciesChanged} />
            </div>
          </Reveal>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-5 items-start">
          <div className="card p-4 lg:sticky lg:top-4">
            <input
              value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
              placeholder="Buscar miembro..."
              className="input w-full px-3 py-2 text-sm mb-3"
            />
            <CascadeScope once>
              <div className="space-y-1 max-h-[620px] overflow-y-auto pr-1">
                {loading && (
                  <p className="text-ink-faint text-xs text-center py-6">Cargando miembros...</p>
                )}
                {!loading && filteredGroups.map((g) => (
                  <MemberRow
                    key={g.user_id}
                    group={g}
                    isSelected={g.user_id === selectedMemberId}
                    onSelect={() => setSelectedMemberId(g.user_id)}
                    debt={worstDebtForUser(goalDebts, g.user_id)}
                  />
                ))}
                {!loading && filteredGroups.length === 0 && (
                  <p className="text-ink-faint text-xs text-center py-6">Sin resultados.</p>
                )}
              </div>
            </CascadeScope>
          </div>

          <div className="card p-5 sm:p-6">
            {loading ? (
              <p className="text-ink-faint text-sm text-center py-16">Cargando personajes...</p>
            ) : selectedGroup ? (
              (() => {
                const nameProps = memberNameProps(
                  selectedGroup.has_app,
                  selectedGroup.frame_name_style as "gradient" | "solid" | "none" | null,
                  selectedGroup.frame_color_1,
                  selectedGroup.frame_color_2
                );
                return (
              <>
                <Reveal kind="unveil">
                <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
                  <div className="flex items-center gap-4 min-w-0">
                    <MemberAvatar
                      group={selectedGroup}
                      size={60}
                      hasApp={selectedGroup.has_app}
                      accent1={selectedGroup.frame_color_1}
                      accent2={selectedGroup.frame_color_2}
                    />
                    <div className="min-w-0">
                      <span className="section-eyebrow">Miembro</span>
                      <h3
                        className={`font-heading font-bold truncate mt-1.5 leading-none tracking-[-0.025em] text-[clamp(1.6rem,2.2vw,2.4rem)] ${nameProps?.className ?? "text-ink"}`}
                        style={nameProps?.style}
                      >
                        {selectedGroup.discord_username}
                      </h3>
                    </div>
                  </div>

                  <div className="flex items-end gap-6">
                    <div>
                      <p className="font-data text-micro uppercase tracking-[0.16em] text-ink-faint">
                        Personajes
                      </p>
                      <p className="font-data font-bold text-ink leading-none mt-1.5 text-3xl">
                        {selectedGroup.characters.length}
                      </p>
                    </div>
                    <div className="pl-6 border-l border-line">
                      <p className="font-data text-micro uppercase tracking-[0.16em] text-ink-faint">
                        ilvl prom.
                      </p>
                      <p
                        className="font-data font-bold leading-none mt-1.5 text-3xl"
                        style={{ color: "var(--color-gold)" }}
                      >
                        {selectedAvgIlvl ?? "—"}
                      </p>
                    </div>
                    {canManage && (
                      <div className="pl-6 border-l border-line self-center">
                        <PillToggle
                          checked={selectedGroup.has_mochila}
                          onChange={(v) => onToggleMochila(selectedGroup.user_id, v)}
                          label="Multicuentas (mochila)"
                        />
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4 mt-5 pt-5 border-t border-line empty:hidden empty:mt-0 empty:pt-0">
                  <MemberGoalsSummary
                    characters={selectedGroup.characters}
                    goals={goals}
                    mainClasses={mainClassesByUser[selectedGroup.user_id]}
                    debts={goalDebts.filter((d) => d.userId === selectedGroup.user_id)}
                  />
                  <MemberUnsavedSummary characters={selectedGroup.characters} />
                </div>
                </Reveal>

                {selectedGroup.characters.length === 0 ? (
                  <div className="mt-5 pt-5 border-t border-line">
                    <p className="text-ink-faint text-sm text-center py-10">
                      Este miembro no tiene ningún personaje registrado todavía.
                    </p>
                  </div>
                ) : (
                  <CascadeScope once>
                    <div className="character-grid is-admin mt-5 pt-5 border-t border-line">
                      {sortCharacters(selectedGroup.characters).map((c, index) => (
                        <AdminCharacterCard
                          key={c.id}
                          character={c}
                          isMain={index === 0}
                          onDelete={onDelete}
                          onEditSpecs={onEditSpecs}
                          onSetRosterTier={onSetRosterTier}
                          accountLabels={selectedAccountLabels}
                        />
                      ))}
                    </div>
                  </CascadeScope>
                )}
              </>
                );
              })()
            ) : (
              <p className="text-ink-faint text-sm text-center py-16">
                Elige un miembro de la lista para ver sus personajes.
              </p>
            )}
          </div>
        </div>
        </>
        )}
      </Section>
    </div>
  );
}

function PersonalView({
  loading,
  characters,
  showAddForm,
  setShowAddForm,
  armoryLink,
  setArmoryLink,
  parsedLink,
  linkError,
  setLinkError,
  addingFromLink,
  onAddFromLink,
  form,
  setForm,
  onAddManual,
  classFilter,
  setClassFilter,
  onDelete,
  onEditSpecs,
  onCharactersImported,
  onReorder,
  hasMochila,
  onToggleMochila,
}: {
  loading: boolean;
  characters: Character[];
  showAddForm: boolean;
  setShowAddForm: (v: boolean | ((prev: boolean) => boolean)) => void;
  armoryLink: string;
  setArmoryLink: (v: string) => void;
  parsedLink: { region: string; realmSlug: string; name: string } | null;
  linkError: string;
  setLinkError: (v: string) => void;
  addingFromLink: boolean;
  onAddFromLink: () => void;
  form: { name: string; realm_slug: string; region: string; class: string; faction: string };
  setForm: (v: { name: string; realm_slug: string; region: string; class: string; faction: string }) => void;
  onAddManual: (e: React.FormEvent) => void;
  classFilter: string;
  setClassFilter: (v: string) => void;
  onDelete: (id: string, name: string) => void;
  onEditSpecs: (character: Character) => void;
  onCharactersImported: () => void;
  onReorder: (orderedIds: string[]) => void;
  hasMochila: boolean;
  onToggleMochila: (value: boolean) => void;
}) {
  const blizzardImport = useBlizzardImport(onCharactersImported);

  const accountLabels = useMemo(
    () => buildWowAccountLabels(characters.map((c) => c.wow_account_number)),
    [characters]
  );

  const chips = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of characters) {
      if (c.class) counts.set(c.class, (counts.get(c.class) ?? 0) + 1);
    }
    const classChips = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([key, count]) => ({ key, label: key, count }));
    return [{ key: "all", label: "Todos", count: characters.length }, ...classChips];
  }, [characters]);

  const [unsavedFilters, setUnsavedFilters] = useState<Set<string>>(new Set());

  function toggleUnsavedFilter(filterKey: string) {
    setUnsavedFilters((prev) => {
      const next = new Set(prev);
      if (next.has(filterKey)) next.delete(filterKey);
      else next.add(filterKey);
      return next;
    });
  }

  const filteredCharacters = sortCharacters(
    (classFilter === "all" ? characters : characters.filter((c) => c.class === classFilter)).filter((c) => {
      if (unsavedFilters.size === 0) return true;
      return Array.from(unsavedFilters).every((filterKey) => {
        const [difficulty, raidKey, bossIndexStr] = filterKey.split(":") as [Difficulty, string, string];
        return !c.kills.includes(bossKey(raidKey, difficulty, Number(bossIndexStr) + 1));
      });
    })
  );
  const canReorder = classFilter === "all" && unsavedFilters.size === 0;

  const main = characters.length > 0 ? sortCharacters(characters)[0] : null;
  const avgIlvl = averageIlvl(characters);

  const addActions = (
    <div className="flex flex-col gap-2 w-56">
      <button onClick={() => setShowAddForm((v) => !v)} className="btn btn-primary w-full">
        {showAddForm ? "Cancelar" : "+ Agregar personaje"}
      </button>
      <BlizzardSyncButton loading={blizzardImport.loading} onClick={blizzardImport.handleSync} />
    </div>
  );

  const addPanel = (
    <>
      <BlizzardImportResults {...blizzardImport} />

      {showAddForm && (
        <div className="card p-5 mb-6 space-y-4">
          <div>
            <label className="block text-xs text-ink-muted mb-2.5 font-medium">
              Pegar link del Armory: se trae ilvl, clase, raza y equipo del
              personaje real — luego eliges a mano qué especialización(es)
              juega para el guild
            </label>
            <div className="flex gap-2.5">
              <input
                value={armoryLink}
                onChange={(e) => {
                  setArmoryLink(e.target.value);
                  setLinkError("");
                }}
                placeholder="https://worldofwarcraft.blizzard.com/en-us/character/us/realm/name"
                autoFocus
                className="input flex-1 px-3.5 py-2.5 text-sm"
              />
              <button
                type="button"
                onClick={onAddFromLink}
                disabled={!parsedLink || addingFromLink}
                className="btn btn-primary"
              >
                {addingFromLink ? "Comprobando..." : "Continuar"}
              </button>
            </div>
            {armoryLink && !parsedLink && (
              <p className="text-xs mt-2.5" style={{ color: "var(--color-danger)" }}>
                No se pudo leer ese link. Verifica que sea un link válido del
                Armory (worldofwarcraft.com/.../character/...).
              </p>
            )}
            {linkError && (
              <p className="text-xs mt-2.5" style={{ color: "var(--color-danger)" }}>
                {linkError}
              </p>
            )}
          </div>

          <details className="group">
            <summary className="cursor-pointer text-xs text-ink-muted hover:text-ink transition-colors w-fit">
              O agrégalo manualmente
            </summary>
            <form onSubmit={onAddManual} className="mt-3 flex flex-wrap gap-3.5 items-end">
              <div>
                <label className="block text-xs text-ink-muted mb-1.5 font-medium">Nombre</label>
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="input px-3 py-2 text-sm"
                  placeholder="Nërý"
                />
              </div>
              <div>
                <label className="block text-xs text-ink-muted mb-1.5 font-medium">Reino (slug)</label>
                <input
                  required
                  value={form.realm_slug}
                  onChange={(e) => setForm({ ...form, realm_slug: e.target.value })}
                  className="input px-3 py-2 text-sm"
                  placeholder="area-52"
                />
              </div>
              <div>
                <label className="block text-xs text-ink-muted mb-1.5 font-medium">Región</label>
                <select
                  value={form.region}
                  onChange={(e) => setForm({ ...form, region: e.target.value })}
                  className="input px-3 py-2 text-sm"
                >
                  <option value="us">US</option>
                  <option value="eu">EU</option>
                  <option value="kr">KR</option>
                  <option value="tw">TW</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-ink-muted mb-1.5 font-medium">
                  Clase (solo si no se encuentra en el Armory)
                </label>
                <select
                  required
                  value={form.class}
                  onChange={(e) => setForm({ ...form, class: e.target.value })}
                  className="input px-3 py-2 text-sm"
                >
                  <option value="" disabled>
                    Elige una clase...
                  </option>
                  {ALL_CLASSES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-ink-muted mb-1.5 font-medium">
                  Facción (solo si no se encuentra en el Armory)
                </label>
                <select
                  value={form.faction}
                  onChange={(e) => setForm({ ...form, faction: e.target.value })}
                  className="input px-3 py-2 text-sm"
                >
                  <option value="">Sin elegir</option>
                  <option value="Horde">Horda</option>
                  <option value="Alliance">Alianza</option>
                </select>
              </div>
              <button type="submit" className="btn btn-primary">
                Continuar
              </button>
            </form>
          </details>
        </div>
      )}
    </>
  );

  if (loading) {
    return <LoadingState variant="cards" count={8} gridClassName="character-grid" />;
  }

  if (characters.length === 0) {
    return (
      <Section
        eyebrow="Tu colección"
        title="Todavía no tienes personajes"
        description="Sincroniza con Battle.net para traer todos tus personajes de una, o agrega uno pegando su link del Armory."
        accent="var(--color-secondary)"
        actions={addActions}
      >
        {addPanel}
      </Section>
    );
  }

  return (
    <div>
      <Section
        eyebrow="Personaje principal"
        title="Tu Main"
        accent={classColor(main?.class ?? null)}
        description="Es el primero de tu orden de personajes. Arrastra otro al primer lugar, más abajo, para cambiarlo."
      >
        <Reveal kind="lift">
          <MainCharacterFeature characters={characters} />
        </Reveal>
      </Section>

      <Section
        eyebrow="Esta semana"
        title="Lo que te queda unsaved"
        meta={avgIlvl !== null ? `ilvl prom. ${avgIlvl}` : undefined}
        accent="var(--color-primary)"
        description="Cada retrato es un jefe que todavía no mataste. El número dice con cuántos de tus personajes lo tienes pendiente; toca uno para filtrar la lista de abajo."
        actions={
          unsavedFilters.size > 0 ? (
            <button
              type="button"
              onClick={() => setUnsavedFilters(new Set())}
              className="btn btn-secondary"
            >
              <X className="w-3.5 h-3.5" />
              Quitar filtro de jefes ({unsavedFilters.size})
            </button>
          ) : undefined
        }
      >
        <Reveal kind="unveil">
          <PersonalUnsavedPanel
            characters={characters}
            activeFilters={unsavedFilters}
            onToggleFilter={toggleUnsavedFilter}
          />
        </Reveal>
      </Section>

      <Section
        eyebrow="Tu colección"
        title="Todos tus personajes"
        meta={`${characters.length} registrado${characters.length === 1 ? "" : "s"}`}
        accent="var(--color-secondary)"
        actions={addActions}
      >
        {addPanel}

        <div className="mb-6 flex flex-wrap items-center gap-x-5 gap-y-3">
          <div className="flex flex-wrap gap-2">
            {chips.map((chip) => {
              const isActive = classFilter === chip.key;
              const color = chip.key === "all" ? "var(--color-primary)" : classColor(chip.key);
              return (
                <button
                  key={chip.key}
                  type="button"
                  onClick={() => {
                    setClassFilter(chip.key);
                    if (chip.key === "all") setUnsavedFilters(new Set());
                  }}
                  className="text-xs font-semibold px-3 py-1.5 rounded-full transition-colors"
                  style={
                    isActive
                      ? {
                          backgroundColor: `color-mix(in srgb, ${color} 18%, transparent)`,
                          border: `1px solid color-mix(in srgb, ${color} 45%, transparent)`,
                          color,
                        }
                      : {
                          backgroundColor: "var(--color-surface-2)",
                          border: "1px solid var(--color-line)",
                          color: "var(--color-ink-muted)",
                        }
                  }
                >
                  {chip.label} ({chip.count})
                </button>
              );
            })}
          </div>

          <span className="hidden sm:block w-px h-6 bg-line shrink-0" aria-hidden />

          <Link
            href="/datos-personajes"
            title="Ver el detalle completo de cada personaje"
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors"
            style={{
              backgroundColor: "var(--color-surface-2)",
              border: "1px solid var(--color-line-strong)",
              color: "var(--color-ink-muted)",
            }}
          >
            <Settings2 className="w-3.5 h-3.5" />
            Datos de los personajes
          </Link>

          <PillToggle
            checked={hasMochila}
            onChange={onToggleMochila}
            label="Tengo multicuentas (puedo llevar mochila)"
          />
        </div>

        {!canReorder && (
          <p className="text-ink-faint text-xs mb-4">
            Mostrando {filteredCharacters.length} de {characters.length}. Quita el filtro de clase
            (elige &quot;Todos&quot;){unsavedFilters.size > 0 ? " y el de jefes pendientes" : ""} para
            poder reordenar tus personajes arrastrándolos.
          </p>
        )}

        {canReorder ? (
          <CascadeScope>
            <SortableCharacterGrid characters={filteredCharacters} onReorder={onReorder}>
              {(c, dragHandle) => (
                <CharacterCard
                  character={c}
                  onDelete={onDelete}
                  onEditSpecs={onEditSpecs}
                  dragHandle={dragHandle}
                  accountLabels={accountLabels}
                />
              )}
            </SortableCharacterGrid>
          </CascadeScope>
        ) : filteredCharacters.length === 0 ? (
          <div className="card px-4 py-10 text-center text-ink-faint text-sm">
            Ningún personaje coincide con los filtros activos.
          </div>
        ) : (
          <CascadeScope>
            <div className="character-grid">
              {filteredCharacters.map((c) => (
                <CharacterCard
                  key={c.id}
                  character={c}
                  onDelete={onDelete}
                  onEditSpecs={onEditSpecs}
                  accountLabels={accountLabels}
                />
              ))}
            </div>
          </CascadeScope>
        )}
      </Section>
    </div>
  );
}

function OffSpecLine({ character }: { character: Character }) {
  if (character.specs.length <= 1) return null;
  return (
    <p className="text-micro text-ink-faint truncate mt-0.5">
      Off-Spec: {character.specs.slice(1).map((s) => shortSpec(character.class, s.name)).join(", ")}
    </p>
  );
}

function FactionLine({ faction, inline = false }: { faction: string | null; inline?: boolean }) {
  const label = factionLabel(faction);
  if (!label) return null;
  if (inline) {
    return (
      <span
        className="text-label font-bold uppercase tracking-[0.1em]"
        style={{ color: factionColor(faction) }}
      >
        {label}
      </span>
    );
  }
  return (
    <p className="text-micro font-bold uppercase tracking-wide mt-0.5" style={{ color: factionColor(faction) }}>
      {label}
    </p>
  );
}

function CopyNameButton({ character }: { character: Character }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(copyDisplayName(character));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
    }
  }

  return (
    <button
      onClick={handleCopy}
      title={copied ? "¡Copiado!" : `Copiar ${copyDisplayName(character)}`}
      className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition hover:brightness-125 hover:shadow-[0_0_10px_-1px_currentColor]"
      style={{
        backgroundColor: copied
          ? "color-mix(in srgb, var(--color-success) 18%, transparent)"
          : "var(--color-surface-2)",
        border: `1px solid ${copied ? "color-mix(in srgb, var(--color-success) 45%, transparent)" : "var(--color-line)"}`,
        color: copied ? "var(--color-success)" : "var(--color-ink-faint)",
      }}
    >
      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
    </button>
  );
}

function WowAccountBadge({ label }: { label: WowAccountLabel }) {
  return (
    <span
      title={`${label.full} de Battle.net`}
      className="mt-0.5 shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full font-data text-micro font-bold"
      style={{
        color: label.color,
        backgroundColor: `color-mix(in srgb, ${label.color} 18%, transparent)`,
        border: `1px solid color-mix(in srgb, ${label.color} 45%, transparent)`,
      }}
    >
      {label.index}
    </span>
  );
}

function DeleteCornerButton({ onClick }: { onClick: (e: React.MouseEvent) => void }) {
  return (
    <button
      onClick={onClick}
      title="Eliminar personaje"
      className="absolute top-2 right-2 z-10 text-ink-faint hover:text-[color:var(--color-danger)] transition-colors rounded-md p-1 hover:bg-[color:var(--color-surface-2)]"
    >
      <X className="w-3.5 h-3.5" />
    </button>
  );
}

function FactionBackdrop({ faction }: { faction: string | null }) {
  const banner = factionBannerUrl(faction);
  if (!banner) return null;
  const backgroundPosition = faction === "Horde" ? "center calc(50% + 6px)" : "center";
  return (
    <div
      className="absolute inset-0 opacity-10"
      style={{
        backgroundImage: `url(${banner})`,
        backgroundSize: "76px auto",
        backgroundPosition,
        backgroundRepeat: "no-repeat",
      }}
      aria-hidden
    />
  );
}

function MainLockoutBoard({ character }: { character: Character }) {
  const raids = useContext(RaidsContext);
  if (raids.length === 0) return null;

  return (
    <div
      className="shrink-0 rounded-xl px-4 py-3"
      style={{
        backgroundColor: "color-mix(in srgb, var(--color-canvas) 72%, transparent)",
        border: "1px solid var(--color-line)",
        backdropFilter: "blur(3px)",
      }}
    >
      <p className="font-data text-micro uppercase tracking-[0.16em] text-ink-faint mb-2">
        Lockouts de la semana
      </p>
      <div
        className="grid gap-x-1.5 gap-y-1 items-center"
        style={{ gridTemplateColumns: `auto repeat(${raids.length}, minmax(0, 1fr))` }}
      >
        {TRACKED_LOCKOUT_DIFFICULTIES.map((difficulty) => (
          <Fragment key={difficulty}>
            <span className="font-data text-micro text-ink-muted pr-1 justify-self-end">
              {DIFFICULTY_LABEL[difficulty]}
            </span>
            {raids.map((raid) => (
              <LockoutCell key={raid.key} raid={raid} difficulty={difficulty} character={character} />
            ))}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

function openHrefInNewTab(href: string) {
  setTimeout(() => {
    const link = document.createElement("a");
    link.href = href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.click();
  }, 0);
}

export function openCharacterLink(e: React.MouseEvent<HTMLAnchorElement>) {
  e.stopPropagation();
  if (e.metaKey || e.ctrlKey) return;
  e.preventDefault();
  openHrefInNewTab(e.currentTarget.href);
}

const CLICK_DRAG_TOLERANCE_PX = 4;

function useDragSafeCharacterLinkClick() {
  const pointerDownAt = useRef<{ x: number; y: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent<HTMLAnchorElement>) => {
    pointerDownAt.current = { x: e.clientX, y: e.clientY };
  };
  const onClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    const start = pointerDownAt.current;
    pointerDownAt.current = null;
    if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > CLICK_DRAG_TOLERANCE_PX) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    openCharacterLink(e);
  };
  return { onPointerDown, onClick };
}

function MainCharacterFeature({ characters }: { characters: Character[] }) {
  const syncedSeasonId = useContext(SyncedSeasonContext);

  const main = characters.length > 0 ? sortCharacters(characters)[0] : null;
  if (!main) return null;

  const color = classColor(main.class);
  const banner = classBannerUrl(main.class);
  const mainRating = formatRating(main.mythic_plus_rating);
  const mainKeystone = formatKeystone(main.mythic_plus_keystone);
  const mainVault = summarizeVault(main.vault, syncedSeasonId);
  const mainVaultVisible = hasVaultData(mainVault);

  return (
    <Link
      href={`/characters/${main.id}?from=personal`}
      onClick={openCharacterLink}
      prefetch={false}
      className="card card-glow card-hover block relative overflow-hidden"
      style={
        {
          borderLeft: `4px solid ${color}`,
          "--card-glow": classGlow(main.class),
        } as React.CSSProperties
      }
    >
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: banner
            ?
              `linear-gradient(90deg, rgba(11,14,21,0.94) 0%, rgba(11,14,21,0.78) 42%, rgba(11,14,21,0.32) 100%), url(${banner})`
            : `linear-gradient(120deg, color-mix(in srgb, ${color} 22%, var(--color-surface-2)), var(--color-surface))`,
          backgroundSize: "cover",
          backgroundPosition: "center top",
        }}
      />

      <div className="relative flex flex-col justify-between gap-8 p-5 sm:p-7 min-h-[13rem] sm:min-h-[17rem]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <span
            className="inline-flex items-center gap-1.5 text-micro font-bold uppercase tracking-[0.14em] px-2.5 py-1 rounded-full"
            style={{
              color: "var(--color-gold)",
              backgroundColor: "color-mix(in srgb, var(--color-gold) 18%, transparent)",
              border: "1px solid color-mix(in srgb, var(--color-gold) 32%, transparent)",
            }}
          >
            <Star className="w-3 h-3 fill-current" />
            Main
          </span>

          <MainLockoutBoard character={main} />
        </div>

        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-5">
          <div className="min-w-0">
            <h3 className="font-heading font-bold text-ink truncate leading-[1.05] tracking-[-0.03em] text-[clamp(2.25rem,3.6vw,3.75rem)]">
              {capitalize(main.name)}
            </h3>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3">
              <span className="font-data text-xs uppercase tracking-[0.14em] text-ink-faint">
                {main.realm_slug}
              </span>
              <span className="w-1 h-1 rounded-full bg-line-strong shrink-0" aria-hidden />
              <span className="text-base font-semibold" style={{ color }}>
                {shortSpec(main.class, main.active_spec)}
              </span>
              <FactionLine faction={main.faction} inline />
            </div>
          </div>

          <div
            className="rounded-xl px-5 py-3.5"
            style={{
              backgroundColor: "color-mix(in srgb, var(--color-canvas) 72%, transparent)",
              border: "1px solid var(--color-line)",
              backdropFilter: "blur(3px)",
            }}
          >
            <div className="flex items-end gap-5 sm:gap-7">
              <div>
                <p className="font-data text-micro uppercase tracking-[0.16em] text-ink-faint">ilvl</p>
                <div className="flex items-center gap-2 mt-1.5">
                  <span
                    className="font-data font-bold leading-none text-[clamp(2.5rem,3.4vw,3.4rem)]"
                    style={{ color: "var(--color-gold)" }}
                  >
                    {main.ilvl ?? "—"}
                  </span>
                  <TierSetBadge
                    count={main.tier_piece_count}
                    sets={main.tier_pieces}
                    legacySetName={main.tier_set_name}
                    size="lg"
                  />
                </div>
              </div>
              {mainRating && (
                <div className="pl-5 sm:pl-7 border-l border-line">
                  <p className="font-data text-micro uppercase tracking-[0.16em] text-ink-faint">IO</p>
                  <p className="font-data font-bold leading-none mt-1.5 text-ink text-[clamp(1.6rem,2.2vw,2.25rem)]">
                    {mainRating}
                  </p>
                </div>
              )}
              {mainKeystone && (
                <div className="min-w-0 pl-5 sm:pl-7 border-l border-line" title={mainKeystone.full}>
                  <p className="font-data text-micro uppercase tracking-[0.16em] text-ink-faint">Llave</p>
                  <p className="font-data font-bold leading-none mt-1.5 text-ink truncate text-[clamp(1.25rem,1.7vw,1.75rem)]">
                    {mainKeystone.short}
                  </p>
                </div>
              )}
              {mainVaultVisible && (
                <div className="pl-5 sm:pl-7 border-l border-line">
                  <p className="font-data text-micro uppercase tracking-[0.16em] text-ink-faint">Vault</p>
                  <div className="flex items-center gap-4 mt-2.5">
                    {mainVault.map((group) => (
                      <VaultMeter key={group.key} group={group} squareSize={12} stacked />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}

function CharacterCard({
  character,
  onDelete,
  onEditSpecs,
  dragHandle,
  accountLabels,
}: {
  character: Character;
  onDelete: (id: string, name: string) => void;
  onEditSpecs: (character: Character) => void;
  dragHandle?: { attributes: DraggableAttributes; listeners: DraggableSyntheticListeners };
  accountLabels: Map<number, WowAccountLabel>;
}) {
  const color = classColor(character.class);
  const accountLabel = character.wow_account_number != null ? accountLabels.get(character.wow_account_number) : undefined;
  const [cascadeRef, cascadeClass, cascadeDelay] = useCascadeSlot<HTMLDivElement>();
  const dragSafeLink = useDragSafeCharacterLinkClick();
  return (
    <div
      ref={cascadeRef}
      className={`card card-hover ${cascadeClass} pt-5 px-3 pb-3 relative overflow-hidden h-full flex flex-col`}
      style={
        {
          borderLeft: `3px solid ${color}`,
          "--card-glow": classGlow(character.class),
          ...cascadeDelay,
        } as React.CSSProperties
      }
    >
      <FactionBackdrop faction={character.faction} />
      <DeleteCornerButton
        onClick={(e) => {
          e.stopPropagation();
          onDelete(character.id, character.name);
        }}
      />
      <Link
        href={`/characters/${character.id}?from=personal`}
        onPointerDown={dragSafeLink.onPointerDown}
        onClick={dragSafeLink.onClick}
        prefetch={false}
        className="relative flex items-start gap-2 cursor-pointer"
      >
        {dragHandle && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            {...dragHandle.attributes}
            {...dragHandle.listeners}
            title="Arrastrar para reordenar"
            className="mt-0.5 shrink-0 text-ink-faint hover:text-ink transition-colors rounded-md p-1 hover:bg-[color:var(--color-surface-2)] cursor-grab active:cursor-grabbing touch-none"
          >
            <GripVertical className="w-3.5 h-3.5" />
          </button>
        )}
        {accountLabel && <WowAccountBadge label={accountLabel} />}
        <div className="min-w-0 flex-1 -mt-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <p
              title={characterTooltip(character)}
              className="min-w-0 font-semibold text-ink text-sm leading-tight truncate"
            >
              {capitalize(character.name)}
            </p>
            <CopyNameButton character={character} />
          </div>
          <p className="min-w-0 text-micro text-ink-faint leading-tight truncate">
            {character.realm_slug}
          </p>
          <div className="flex items-center gap-1.5 min-w-0 mt-0.5">
            <p className="min-w-0 text-xs leading-tight truncate" style={{ color }}>
              {shortSpec(character.class, character.active_spec)}
            </p>
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onEditSpecs(character);
              }}
              title="Editar especialización"
              className="shrink-0 text-ink-faint hover:text-[color:var(--color-ink)] transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          </div>
          <OffSpecLine character={character} />
        </div>
        <HeaderIlvl character={character} />
      </Link>

      <div className="relative mt-1 pt-1 border-t border-line">
        <WeeklyStatus character={character} />
      </div>
    </div>
  );
}

function SortableCharacterGrid({
  characters,
  onReorder,
  children,
}: {
  characters: Character[];
  onReorder: (orderedIds: string[]) => void;
  children: (
    character: Character,
    dragHandle: { attributes: DraggableAttributes; listeners: DraggableSyntheticListeners }
  ) => React.ReactNode;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const freezeCascade = useCascadeFreeze();

  const gridRef = useRef<HTMLDivElement>(null);
  const wasDraggingRef = useRef(false);

  useEffect(() => {
    const preventClickIfWasDragging = (e: MouseEvent) => {
      if (wasDraggingRef.current && gridRef.current?.contains(e.target as Node)) {
        e.preventDefault();
      }
    };
    document.addEventListener("click", preventClickIfWasDragging, { capture: true });
    return () => document.removeEventListener("click", preventClickIfWasDragging, { capture: true });
  }, []);

  function handleDragEnd(event: DragEndEvent) {
    freezeCascade(false);
    setTimeout(() => {
      wasDraggingRef.current = false;
    }, 100);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = characters.findIndex((c) => c.id === active.id);
    const newIndex = characters.findIndex((c) => c.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    onReorder(arrayMove(characters, oldIndex, newIndex).map((c) => c.id));
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={() => {
        freezeCascade(true);
        wasDraggingRef.current = true;
      }}
      onDragCancel={() => {
        freezeCascade(false);
        setTimeout(() => {
          wasDraggingRef.current = false;
        }, 100);
      }}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={characters.map((c) => c.id)} strategy={rectSortingStrategy}>
        <div ref={gridRef} className="character-grid">
          {characters.map((c) => (
            <SortableCharacterItem key={c.id} id={c.id}>
              {(dragHandle) => children(c, dragHandle)}
            </SortableCharacterItem>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function SortableCharacterItem({
  id,
  children,
}: {
  id: string;
  children: (dragHandle: { attributes: DraggableAttributes; listeners: DraggableSyntheticListeners }) => React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} className="h-full">
      {children({ attributes, listeners })}
    </div>
  );
}

function AdminCharacterCard({
  character,
  isMain,
  onDelete,
  onEditSpecs,
  onSetRosterTier,
  accountLabels,
}: {
  character: Character;
  isMain: boolean;
  onDelete?: (id: string, name: string) => void;
  onEditSpecs?: (character: Character) => void;
  onSetRosterTier?: (characterId: string, tier: CharacterTier) => void;
  accountLabels: Map<number, WowAccountLabel>;
}) {
  const color = classColor(character.class);
  const lastUpdatedLabel = character.last_updated
    ? `Actualizado: ${new Date(character.last_updated).toLocaleDateString()}`
    : "Nunca actualizado";
  const accountLabel = character.wow_account_number != null ? accountLabels.get(character.wow_account_number) : undefined;
  const [cascadeRef, cascadeClass, cascadeDelay] = useCascadeSlot<HTMLDivElement>();
  return (
    <div
      ref={cascadeRef}
      onClick={() => openHrefInNewTab(`/characters/${character.id}?from=admin`)}
      className={`card card-hover ${cascadeClass} pt-5 px-3 pb-3 cursor-pointer relative overflow-hidden h-full flex flex-col`}
      style={
        {
          borderLeft: `3px solid ${color}`,
          "--card-glow": classGlow(character.class),
          ...cascadeDelay,
        } as React.CSSProperties
      }
    >
      <FactionBackdrop faction={character.faction} />
      {onDelete && (
        <DeleteCornerButton
          onClick={(e) => {
            e.stopPropagation();
            onDelete(character.id, character.name);
          }}
        />
      )}
      <Link
        href={`/characters/${character.id}?from=admin`}
        onClick={openCharacterLink}
        prefetch={false}
        className="relative flex items-start gap-2"
      >
        {accountLabel && <WowAccountBadge label={accountLabel} />}
        <div className="min-w-0 flex-1 -mt-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <p
              title={characterTooltip(character)}
              className="min-w-0 font-semibold text-ink text-sm leading-tight truncate"
            >
              {capitalize(character.name)}
            </p>
            {isMain && (
              <span title="Personaje Main" className="shrink-0 inline-flex">
                <Star className="w-3 h-3 fill-current" style={{ color: "var(--color-gold)" }} />
              </span>
            )}
            <CopyNameButton character={character} />
          </div>
          <p className="min-w-0 text-micro text-ink-faint leading-tight truncate">
            {character.realm_slug}
          </p>
          <div className="flex items-center gap-1.5 min-w-0 mt-0.5">
            <p className="min-w-0 text-xs leading-tight truncate" style={{ color }}>
              {shortSpec(character.class, character.active_spec)}
            </p>
            {onEditSpecs && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onEditSpecs(character);
                }}
                title="Editar especialización"
                className="shrink-0 text-ink-faint hover:text-[color:var(--color-ink)] transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <OffSpecLine character={character} />
        </div>
        <HeaderIlvl character={character} />
      </Link>

      <div className="relative mt-1 pt-1 border-t border-line" title={lastUpdatedLabel}>
        <WeeklyStatus character={character} />
      </div>

      {onSetRosterTier && (
        <RosterTierSelect
          value={character.roster_tier ?? "normal"}
          onChange={(tier) => onSetRosterTier(character.id, tier)}
        />
      )}
    </div>
  );
}

function RosterTierSelect({
  value,
  onChange,
}: {
  value: CharacterTier;
  onChange: (tier: CharacterTier) => void;
}) {
  const isDefault = value === "normal";
  return (
    <div
      className="relative mt-2 pt-2 border-t border-line"
      onClick={(e) => e.stopPropagation()}
    >
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as CharacterTier)}
        title={ROSTER_TIER_HINTS[value]}
        aria-label="Prioridad para el roster automático"
        className="input w-full px-2 py-1 text-label"
        style={
          isDefault
            ? undefined
            : { color: "var(--color-gold)", borderColor: "color-mix(in srgb, var(--color-gold) 45%, transparent)" }
        }
      >
        {ROSTER_TIERS.map((t) => (
          <option key={t} value={t}>
            {ROSTER_TIER_LABELS[t]}
          </option>
        ))}
      </select>
    </div>
  );
}
