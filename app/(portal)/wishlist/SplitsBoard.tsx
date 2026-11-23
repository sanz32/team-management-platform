"use client";

import { useEffect, useState } from "react";
import { Plus, Check, X, Trash2, Pencil, Swords, Eye, Megaphone, CheckCircle2 } from "lucide-react";
import DifficultyTabs from "@/app/components/DifficultyTabs";
import BossThumb from "@/app/components/BossThumb";
import IconAction from "@/app/components/IconAction";
import { useConfirm } from "@/app/components/ConfirmDialogProvider";
import { useToast } from "@/app/components/ToastProvider";
import {
  upgradeBadgeTier,
  metricLabel,
  ARMOR_CATEGORIES,
  ArmorCategory,
  WishlistDifficulty,
  UPGRADE_TIERS,
  UPGRADE_TIER_COLORS,
  UpgradeTier,
} from "@/lib/wishlist";
import { qualityColor } from "@/lib/item-quality";
import { classColor, ALL_CLASSES } from "@/lib/wow-classes";
import { readJsonBody } from "@/lib/read-json";

interface BoardUpgrade {
  id: string;
  bossId: string;
  bossName: string;
  bossOrderIndex: number;
  bossImageUrl: string | null;
  itemId: number;
  itemName: string | null;
  itemIconUrl: string | null;
  itemSlot: string | null;
  itemQuality: string | null;
  armorCategory: ArmorCategory;
  ilvl: number;
  difficulty: WishlistDifficulty | null;
  upgradePct: number;
  upgradeAbsolute: number | null;
  priority: number | null;
  isTierPiece: boolean;
  source: string;
  characterId: string;
  characterName: string;
  characterClass: string | null;
  characterIlvl: number | null;
  characterRealmName: string | null;
  characterRealmSlug: string | null;
  specId: number | null;
  specName: string | null;
  specRole: string | null;
  specIconUrl: string | null;
  provider: "raidbots" | "qelive";
  metricType: "dps" | "hps";
  simUrl: string | null;
  importedAt: string | null;
  baselineOutput: number | null;
  isStale: boolean;
}

interface SeasonBoss {
  id: string;
  name: string;
  orderIndex: number;
  imageUrl: string | null;
}

interface SplitAssignment {
  id: string;
  characterId: string;
  characterName: string;
  characterClass: string | null;
  characterRealmName: string | null;
  characterRealmSlug: string | null;
  itemId: number;
  itemName: string | null;
  itemIconUrl: string | null;
  itemQuality: string | null;
  bossId: string;
  bossName: string;
  bossOrderIndex: number;
  difficulty: string | null;
  upgradePct: number | null;
  upgradeAbsolute: number | null;
  metricType: string | null;
  specName: string | null;
  specIconUrl: string | null;
  specs: AssignmentSpecEntry[];
}

interface AssignmentSpecEntry {
  specId: number | null;
  specName: string | null;
  specIconUrl: string | null;
  upgradePct: number;
  upgradeAbsolute: number | null;
  metricType: string;
}

interface Split {
  id: string;
  name: string;
  createdAt: string;
  assignments: SplitAssignment[];
}

function valueText(u: { upgradePct: number; upgradeAbsolute: number | null; metricType: string }, mode: "pct" | "abs"): string {
  if (mode === "abs" && u.upgradeAbsolute != null) {
    return `+${Math.round(u.upgradeAbsolute).toLocaleString("es-CL")} ${metricLabel(u.metricType)}`;
  }
  return `+${u.upgradePct.toFixed(1)}% ${metricLabel(u.metricType)}`;
}

function ItemLink({
  itemId,
  children,
  className,
  style,
}: {
  itemId: number;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <a
      href={`https://www.wowhead.com/item=${itemId}`}
      data-wowhead={`item=${itemId}`}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      style={style}
    >
      {children}
    </a>
  );
}

function characterRealm(realmName: string | null, realmSlug: string | null): string | null {
  return realmName ? realmName.replace(/\s+/g, "") : realmSlug;
}

function characterDisplayName(name: string, realmName: string | null, realmSlug: string | null): string {
  const realm = characterRealm(realmName, realmSlug);
  return realm ? `${name}-${realm}` : name;
}

function SpecIcon({ url, size = 16 }: { url: string | null; size?: number }) {
  if (!url) return <div className="rounded-sm shrink-0" style={{ width: size, height: size, backgroundColor: "var(--color-surface-2)" }} />;
  return <img src={url} alt="" className="rounded-sm shrink-0" style={{ width: size, height: size }} />;
}

function ItemIcon({ url, size = 24 }: { url: string | null; size?: number }) {
  if (!url) return <div className="rounded shrink-0" style={{ width: size, height: size, backgroundColor: "var(--color-surface-2)" }} />;
  return <img src={url} alt="" className="rounded shrink-0" style={{ width: size, height: size }} />;
}

function assignedKey(characterId: string, itemId: number): string {
  return `${characterId}:${itemId}`;
}

type AssignState = "none" | "active" | "other";

function buildAssignStateMap(splits: Split[], activeSplitId: string | null): Map<string, { state: AssignState; otherNames: string[] }> {
  const map = new Map<string, { state: AssignState; otherNames: string[] }>();
  for (const split of splits) {
    for (const a of split.assignments) {
      const key = assignedKey(a.characterId, a.itemId);
      const isActive = split.id === activeSplitId;
      const existing = map.get(key);
      if (isActive) {
        map.set(key, { state: "active", otherNames: existing?.otherNames ?? [] });
      } else if (!existing || existing.state !== "active") {
        map.set(key, { state: "other", otherNames: [...(existing?.otherNames ?? []), split.name] });
      }
    }
  }
  return map;
}

function AssignButton({
  info,
  disabled,
  pending,
  onClick,
}: {
  info: { state: AssignState; otherNames: string[] };
  disabled: boolean;
  pending: boolean;
  onClick: () => void;
}) {
  if (info.state === "other") {
    return (
      <div
        className="shrink-0 p-1 rounded-md cursor-help"
        style={{ color: "var(--color-warning)" }}
        title={`Ya asignado en: ${info.otherNames.join(", ")}`}
      >
        <Check className="w-3.5 h-3.5" />
      </div>
    );
  }
  const assigned = info.state === "active";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || pending}
      title={disabled ? "Elige o crea un split arriba" : assigned ? "Quitar del split" : "Agregar al split"}
      className="hover-surface shrink-0 p-1 rounded-md transition-colors disabled:opacity-40"
      style={{ color: assigned ? "var(--color-success)" : "var(--color-ink-faint)" }}
    >
      {assigned ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
    </button>
  );
}

function AssignmentRow({ a, onRemove }: { a: SplitAssignment; onRemove?: (id: string) => void }) {
  const characterFullName = characterDisplayName(a.characterName, a.characterRealmName, a.characterRealmSlug);
  const specEntries: AssignmentSpecEntry[] =
    a.specs.length > 0
      ? a.specs
      : a.upgradePct != null
        ? [
            {
              specId: null,
              specName: a.specName,
              specIconUrl: a.specIconUrl,
              upgradePct: a.upgradePct,
              upgradeAbsolute: a.upgradeAbsolute,
              metricType: a.metricType ?? "dps",
            },
          ]
        : [];
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg" style={{ backgroundColor: "var(--color-surface-2)" }}>
      <ItemLink itemId={a.itemId} className="inline-flex items-center gap-1.5 min-w-0 shrink" style={{ maxWidth: "58%" }}>
        <ItemIcon url={a.itemIconUrl} size={18} />
        <span className="text-xs truncate" title={a.itemName ?? undefined} style={{ color: qualityColor(a.itemQuality) }}>
          {a.itemName ?? "Item desconocido"}
        </span>
      </ItemLink>
      <span className="text-ink-faint text-micro shrink-0">·</span>
      <span
        className="text-xs font-medium truncate min-w-0 shrink"
        title={characterFullName}
        style={{ maxWidth: "42%", color: classColor(a.characterClass) }}
      >
        {characterFullName}
      </span>
      <span className="flex-1" />
      {specEntries.length > 0 && (
        <span className="flex items-center gap-2 flex-wrap justify-end shrink-0">
          {specEntries.map((entry, idx) => (
            <span key={entry.specId ?? idx} className="flex items-center gap-1" title={entry.specName ?? undefined}>
              <SpecIcon url={entry.specIconUrl} size={14} />
              <span
                className="text-label font-semibold whitespace-nowrap"
                style={{ color: UPGRADE_TIER_COLORS[upgradeBadgeTier(entry.upgradePct)] }}
              >
                +{entry.upgradePct.toFixed(1)}% {metricLabel(entry.metricType)}
              </span>
            </span>
          ))}
        </span>
      )}
      {onRemove && (
        <IconAction icon={X} label="Quitar del split" onClick={() => onRemove(a.id)} className="hover:text-[color:var(--color-danger)]" />
      )}
    </div>
  );
}

function AssignmentGroupsByBoss({ assignments, onRemove }: { assignments: SplitAssignment[]; onRemove?: (id: string) => void }) {
  const byBoss = new Map<string, SplitAssignment[]>();
  for (const a of assignments) {
    if (!byBoss.has(a.bossId)) byBoss.set(a.bossId, []);
    byBoss.get(a.bossId)!.push(a);
  }
  const groups = Array.from(byBoss.values()).sort((a, b) => a[0].bossOrderIndex - b[0].bossOrderIndex);

  return (
    <div className="space-y-4">
      {groups.map((rows) => (
        <div key={rows[0].bossId}>
          <div className="text-xs font-semibold text-ink-faint mb-1.5">{rows[0].bossName}</div>
          <div className="space-y-1">
            {rows.map((a) => (
              <AssignmentRow key={a.id} a={a} onRemove={onRemove} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function groupByCharacter(rows: BoardUpgrade[]): {
  characterId: string;
  characterName: string;
  characterRealmName: string | null;
  characterRealmSlug: string | null;
  characterClass: string | null;
  entries: BoardUpgrade[];
}[] {
  const map = new Map<string, { characterId: string; characterName: string; characterRealmName: string | null; characterRealmSlug: string | null; characterClass: string | null; entries: BoardUpgrade[] }>();
  for (const r of rows) {
    if (!map.has(r.characterId)) {
      map.set(r.characterId, {
        characterId: r.characterId,
        characterName: r.characterName,
        characterRealmName: r.characterRealmName,
        characterRealmSlug: r.characterRealmSlug,
        characterClass: r.characterClass,
        entries: [],
      });
    }
    map.get(r.characterId)!.entries.push(r);
  }
  const groups = Array.from(map.values());
  groups.forEach((g) => g.entries.sort((a, b) => b.upgradePct - a.upgradePct));
  return groups.sort((a, b) => b.entries[0].upgradePct - a.entries[0].upgradePct);
}

function CharacterBox({
  characterName,
  characterRealmName,
  characterRealmSlug,
  characterClass,
  entries,
  mode,
  stateByKey,
  pendingKey,
  disabled,
  onToggle,
}: {
  characterName: string;
  characterRealmName: string | null;
  characterRealmSlug: string | null;
  characterClass: string | null;
  entries: BoardUpgrade[];
  mode: "pct" | "abs";
  stateByKey: Map<string, { state: AssignState; otherNames: string[] }>;
  pendingKey: string | null;
  disabled: boolean;
  onToggle: (entry: BoardUpgrade) => void;
}) {
  const color = classColor(characterClass);
  const realm = characterRealm(characterRealmName, characterRealmSlug);
  const best = entries[0];
  const key = assignedKey(best.characterId, best.itemId);
  const info = stateByKey.get(key) ?? { state: "none" as AssignState, otherNames: [] };
  const pending = pendingKey === key;

  return (
    <div
      className="rounded-md px-2 py-1.5"
      style={{
        backgroundColor:
          info.state === "active"
            ? "color-mix(in srgb, var(--color-success) 16%, var(--color-surface-2))"
            : "var(--color-surface-2)",
      }}
    >
      <div className="flex items-start justify-between gap-1 mb-1">
        <div className="min-w-0 leading-tight">
          <div className="text-xs font-medium truncate" style={{ color }}>
            {characterName}
          </div>
          {realm && <div className="text-micro text-ink-faint truncate">{realm}</div>}
        </div>
        <AssignButton info={info} disabled={disabled} pending={pending} onClick={() => onToggle(best)} />
      </div>
      <div className="space-y-0.5">
        {entries.map((e) => {
          const tierColor = UPGRADE_TIER_COLORS[upgradeBadgeTier(e.upgradePct)];
          return (
            <div key={e.id} className="flex items-center gap-1.5">
              <SpecIcon url={e.specIconUrl} />
              <span className="text-label font-semibold whitespace-nowrap" style={{ color: tierColor }}>
                {valueText(e, mode)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ItemBlock({
  rows,
  mode,
  stateByKey,
  pendingKey,
  disabled,
  onToggle,
}: {
  rows: BoardUpgrade[];
  mode: "pct" | "abs";
  stateByKey: Map<string, { state: AssignState; otherNames: string[] }>;
  pendingKey: string | null;
  disabled: boolean;
  onToggle: (entry: BoardUpgrade) => void;
}) {
  const first = rows[0];
  const dpsRows = rows.filter((r) => r.metricType === "dps");
  const hpsRows = rows.filter((r) => r.metricType === "hps");

  const renderGroup = (groupRows: BoardUpgrade[]) => (
    <div className="flex flex-wrap gap-1.5">
      {groupByCharacter(groupRows).map((g) => (
        <div key={g.characterId} style={{ flex: "0 0 140px" }}>
          <CharacterBox
            characterName={g.characterName}
            characterRealmName={g.characterRealmName}
            characterRealmSlug={g.characterRealmSlug}
            characterClass={g.characterClass}
            entries={g.entries}
            mode={mode}
            stateByKey={stateByKey}
            pendingKey={pendingKey}
            disabled={disabled}
            onToggle={onToggle}
          />
        </div>
      ))}
    </div>
  );

  return (
    <div className="card p-2.5">
      <ItemLink itemId={first.itemId} className="inline-flex items-center gap-2 mb-2 max-w-full">
        <ItemIcon url={first.itemIconUrl} size={24} />
        <div className="min-w-0">
          <div className="text-xs font-semibold truncate max-w-[170px]" style={{ color: qualityColor(first.itemQuality) }}>
            {first.itemName ?? "Item desconocido"}
          </div>
          <div className="text-micro text-ink-faint">
            ilvl {first.ilvl}
            {first.isTierPiece && <span className="text-[color:var(--color-epic)]"> · Tier</span>}
          </div>
        </div>
      </ItemLink>
      {dpsRows.length > 0 && hpsRows.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          <div>
            <div className="text-micro text-ink-faint font-semibold mb-1">DPS</div>
            {renderGroup(dpsRows)}
          </div>
          <div>
            <div className="text-micro text-ink-faint font-semibold mb-1">Healers</div>
            {renderGroup(hpsRows)}
          </div>
        </div>
      ) : (
        renderGroup(rows)
      )}
    </div>
  );
}

function bossPctColor(pct: number | undefined): string {
  if (pct == null) return "var(--color-ink-faint)";
  return UPGRADE_TIER_COLORS[upgradeBadgeTier(pct)];
}

function BossSidebar({
  bosses,
  selectedBossId,
  onSelect,
  topPctByBoss,
}: {
  bosses: SeasonBoss[];
  selectedBossId: string | null;
  onSelect: (id: string) => void;
  topPctByBoss: Map<string, number>;
}) {
  return (
    <div className="space-y-1">
      {bosses.map((boss) => {
        const active = boss.id === selectedBossId;
        const topPct = topPctByBoss.get(boss.id);
        return (
          <button
            key={boss.id}
            onClick={() => onSelect(boss.id)}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-colors"
            style={{
              backgroundColor: active ? "var(--color-surface-2)" : "transparent",
              borderLeft: active ? "3px solid var(--color-primary)" : "3px solid transparent",
            }}
          >
            <BossThumb imageUrl={boss.imageUrl} />
            <div className="min-w-0 flex-1">
              <div className={`text-sm truncate ${active ? "text-ink font-semibold" : "text-ink-muted"}`}>{boss.name}</div>
              <div className="text-xs font-semibold" style={{ color: bossPctColor(topPct) }}>
                {topPct != null ? `+${topPct.toFixed(1)}%` : "—"}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function BossDetail({
  boss,
  upgrades,
  mode,
  stateByKey,
  pendingKey,
  disabled,
  onToggle,
}: {
  boss: SeasonBoss | null;
  upgrades: BoardUpgrade[];
  mode: "pct" | "abs";
  stateByKey: Map<string, { state: AssignState; otherNames: string[] }>;
  pendingKey: string | null;
  disabled: boolean;
  onToggle: (entry: BoardUpgrade) => void;
}) {
  if (!boss) return <div className="card p-6 text-center text-ink-muted text-sm">Elige un jefe.</div>;

  const byItem = new Map<number, BoardUpgrade[]>();
  for (const u of upgrades) {
    if (!byItem.has(u.itemId)) byItem.set(u.itemId, []);
    byItem.get(u.itemId)!.push(u);
  }
  const items = Array.from(byItem.values()).sort((a, b) => b[0].upgradePct - a[0].upgradePct);

  return (
    <div>
      <div className="flex items-center gap-2.5 mb-4">
        <BossThumb imageUrl={boss.imageUrl} width={64} height={32} />
        <h2 className="font-heading font-semibold text-ink text-xl">{boss.name}</h2>
      </div>
      {items.length === 0 ? (
        <div className="card p-6 text-center text-ink-muted text-sm">
          Nadie tiene una mejora de este jefe en esta dificultad todavía.
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {items.map((rows) => (
            <ItemBlock
              key={rows[0].itemId}
              rows={rows}
              mode={mode}
              stateByKey={stateByKey}
              pendingKey={pendingKey}
              disabled={disabled}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ByCharacterView({
  upgrades,
  mode,
  stateByKey,
  pendingKey,
  disabled,
  onToggle,
}: {
  upgrades: BoardUpgrade[];
  mode: "pct" | "abs";
  stateByKey: Map<string, { state: AssignState; otherNames: string[] }>;
  pendingKey: string | null;
  disabled: boolean;
  onToggle: (entry: BoardUpgrade) => void;
}) {
  const byCharacter = new Map<string, BoardUpgrade[]>();
  for (const u of upgrades) {
    if (!byCharacter.has(u.characterId)) byCharacter.set(u.characterId, []);
    byCharacter.get(u.characterId)!.push(u);
  }

  return (
    <div className="space-y-6">
      {Array.from(byCharacter.entries()).map(([characterId, rows]) => {
        const sorted = [...rows].sort((a, b) => a.bossOrderIndex - b.bossOrderIndex || b.upgradePct - a.upgradePct);
        const first = sorted[0];
        const specTotals = new Map<number | string, BoardUpgrade>();
        for (const u of rows) {
          if (u.baselineOutput == null) continue;
          const key = u.specId ?? u.specName ?? u.id;
          if (!specTotals.has(key)) specTotals.set(key, u);
        }
        return (
          <div key={characterId} className="card p-5">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className="font-heading font-semibold" style={{ color: classColor(first.characterClass) }}>
                {characterDisplayName(first.characterName, first.characterRealmName, first.characterRealmSlug)}
              </span>
              {Array.from(specTotals.values()).map((u) => (
                <span
                  key={u.specId ?? u.specName}
                  className="flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full"
                  title={u.specName ?? undefined}
                  style={{ color: "var(--color-primary)", backgroundColor: "color-mix(in srgb, var(--color-primary) 14%, transparent)" }}
                >
                  <SpecIcon url={u.specIconUrl} size={13} />
                  {Math.round(u.baselineOutput!).toLocaleString("es-CL")} {metricLabel(u.metricType)}
                </span>
              ))}
            </div>
            <div className="divide-y" style={{ borderColor: "var(--color-surface-2)" }}>
              {sorted.map((u) => {
                const key = assignedKey(u.characterId, u.itemId);
                const info = stateByKey.get(key) ?? { state: "none" as AssignState, otherNames: [] };
                return (
                  <div key={u.id} className="flex items-center gap-3 py-2">
                    <SpecIcon url={u.specIconUrl} size={20} />
                    <div className="min-w-0 flex-1">
                      <ItemLink itemId={u.itemId} className="inline-flex items-center gap-3 max-w-full">
                        <ItemIcon url={u.itemIconUrl} size={28} />
                        <div className="min-w-0">
                          <div className="text-sm truncate max-w-[260px]" style={{ color: qualityColor(u.itemQuality) }}>
                            {u.itemName ?? "Item desconocido"}
                          </div>
                          <div className="text-xs text-ink-faint">{u.bossName}</div>
                        </div>
                      </ItemLink>
                    </div>
                    <span
                      className="text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap shrink-0"
                      style={{
                        color: UPGRADE_TIER_COLORS[upgradeBadgeTier(u.upgradePct)],
                        backgroundColor: `color-mix(in srgb, ${UPGRADE_TIER_COLORS[upgradeBadgeTier(u.upgradePct)]} 16%, transparent)`,
                      }}
                    >
                      {valueText(u, mode)}
                    </span>
                    <AssignButton info={info} disabled={disabled} pending={pendingKey === key} onClick={() => onToggle(u)} />
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ReadOnlySplitsList({ splits, loading }: { splits: Split[]; loading: boolean }) {
  if (loading) return <p className="text-ink-faint text-sm">Cargando...</p>;
  if (splits.length === 0) {
    return <div className="card p-6 text-center text-ink-muted text-sm">Todavía no hay ningún split creado.</div>;
  }
  return (
    <div
      className="grid gap-4 items-start"
      style={{ gridTemplateColumns: "repeat(auto-fit, minmax(max(400px, calc((100% - 2rem) / 3)), 1fr))" }}
    >
      {splits.map((split) => (
        <div key={split.id} className="card p-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h2 className="font-heading font-semibold text-ink text-sm truncate min-w-0">{split.name}</h2>
            <span className="text-label text-ink-faint shrink-0">
              {split.assignments.length} ítem{split.assignments.length === 1 ? "" : "s"}
            </span>
          </div>
          {split.assignments.length === 0 ? (
            <p className="text-ink-faint text-xs">Sin asignaciones todavía.</p>
          ) : (
            <AssignmentGroupsByBoss assignments={split.assignments} />
          )}
        </div>
      ))}
    </div>
  );
}

export default function SplitsBoard({
  canManage,
  initialViewingAll = false,
}: {
  canManage: boolean;
  initialViewingAll?: boolean;
}) {
  const confirm = useConfirm();
  const toast = useToast();
  const [seasonName, setSeasonName] = useState<string | null>(null);
  const [bosses, setBosses] = useState<SeasonBoss[]>([]);
  const [upgrades, setUpgrades] = useState<BoardUpgrade[]>([]);
  const [splits, setSplits] = useState<Split[]>([]);
  const [activeSplitId, setActiveSplitId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [selectedBossId, setSelectedBossId] = useState<string | null>(null);
  const [groupByCharacterView, setGroupByCharacterView] = useState(false);
  const [difficulty, setDifficulty] = useState<WishlistDifficulty>("mythic");
  const [valueMode, setValueMode] = useState<"pct" | "abs">("pct");
  const [roleFilter, setRoleFilter] = useState("all");
  const [classFilter, setClassFilter] = useState("all");
  const [providerFilter, setProviderFilter] = useState("all");
  const [armorFilter, setArmorFilter] = useState("all");
  const [tierFilter, setTierFilter] = useState<"all" | UpgradeTier>("all");
  const [hideStale, setHideStale] = useState(false);
  const [newSplitName, setNewSplitName] = useState("");
  const [creatingSplit, setCreatingSplit] = useState(false);
  const [renamingSplit, setRenamingSplit] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [viewingAll, setViewingAll] = useState(initialViewingAll);
  const [notifyingSplitId, setNotifyingSplitId] = useState<string | null>(null);
  const [notifiedSplitId, setNotifiedSplitId] = useState<string | null>(null);

  function load() {
    Promise.resolve()
      .then(() => setLoading(true))
      .then(() =>
        canManage
          ? Promise.all([
              fetch("/api/admin/wishlist/board").then((r) => r.json()),
              fetch("/api/wishlist/season").then((r) => r.json()),
              fetch("/api/admin/wishlist/splits").then((r) => r.json()),
            ])
          : Promise.all([
              Promise.resolve({ season: null, upgrades: [] }),
              Promise.resolve({ season: null }),
              fetch("/api/admin/wishlist/splits").then((r) => r.json()),
            ])
      )
      .then(([board, seasonRes, splitsRes]) => {
        setSeasonName(board.season?.name ?? null);
        setUpgrades(board.upgrades ?? []);
        const bossList: SeasonBoss[] = seasonRes.season?.bosses ?? [];
        setBosses(bossList);
        setSelectedBossId((prev) => (prev && bossList.some((b) => b.id === prev) ? prev : bossList[0]?.id ?? null));
        const splitList: Split[] = splitsRes.splits ?? [];
        setSplits(splitList);
        setActiveSplitId((prev) => (prev && splitList.some((s) => s.id === prev) ? prev : splitList[0]?.id ?? null));
      })
      .finally(() => {
        setLoading(false);
        setHasLoadedOnce(true);
      });
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!canManage) {
    if (!hasLoadedOnce) return <p className="text-ink-faint text-sm">Cargando...</p>;
    return <ReadOnlySplitsList splits={splits} loading={loading} />;
  }

  const activeSplit = splits.find((s) => s.id === activeSplitId) ?? null;
  const stateByKey = buildAssignStateMap(splits, activeSplitId);

  async function createSplit() {
    const name = newSplitName.trim();
    if (!name) return;
    setCreatingSplit(true);
    setError("");
    try {
      const res = await fetch("/api/admin/wishlist/splits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await readJsonBody(res);
      if (!res.ok) {
        setError(data.error || "No se pudo crear el split.");
        return;
      }
      setSplits((prev) => [...prev, data.split]);
      setActiveSplitId(data.split.id);
      setNewSplitName("");
    } finally {
      setCreatingSplit(false);
    }
  }

  async function renameSplit() {
    if (!activeSplit) return;
    const name = renameValue.trim();
    if (!name) return;
    const res = await fetch(`/api/admin/wishlist/splits/${activeSplit.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await readJsonBody(res);
    if (!res.ok) {
      setError(data.error || "No se pudo renombrar el split.");
      return;
    }
    const savedName = data.split?.name ?? name;
    setSplits((prev) => prev.map((s) => (s.id === activeSplit.id ? { ...s, name: savedName } : s)));
    setRenamingSplit(false);
  }

  async function deleteSplit() {
    if (!activeSplit) return;
    const confirmed = await confirm(
      `¿Borrar el split "${activeSplit.name}" y sus ${activeSplit.assignments.length} asignación(es)? Esta acción no se puede deshacer.`,
      { title: "Borrar split", confirmLabel: "Borrar", danger: true }
    );
    if (!confirmed) return;
    const res = await fetch(`/api/admin/wishlist/splits/${activeSplit.id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await readJsonBody(res).catch(() => ({}));
      setError(data.error || "No se pudo borrar el split.");
      return;
    }
    setSplits((prev) => {
      const next = prev.filter((s) => s.id !== activeSplit.id);
      setActiveSplitId(next[0]?.id ?? null);
      return next;
    });
  }

  async function notifySplit() {
    if (!activeSplit) return;
    const id = activeSplit.id;
    setNotifyingSplitId(id);
    setNotifiedSplitId(null);
    setError("");
    try {
      const res = await fetch(`/api/admin/wishlist/splits/${id}/notify`, { method: "POST" });
      if (res.ok) {
        setNotifiedSplitId(id);
        setTimeout(() => setNotifiedSplitId((prev) => (prev === id ? null : prev)), 3000);
        toast.success("Split anunciado en Discord");
      } else {
        const data = await readJsonBody(res).catch(() => ({}));
        setError(data.error || "No se pudo notificar el split.");
        toast.error("No se pudo anunciar el split", data.error || undefined);
      }
    } finally {
      setNotifyingSplitId(null);
    }
  }

  async function toggleAssign(entry: BoardUpgrade) {
    if (!activeSplit) return;
    const key = assignedKey(entry.characterId, entry.itemId);
    const existing = activeSplit.assignments.find((a) => assignedKey(a.characterId, a.itemId) === key);
    setPendingKey(key);
    setError("");

    if (existing) {
      setSplits((prev) =>
        prev.map((s) => (s.id === activeSplit.id ? { ...s, assignments: s.assignments.filter((a) => a.id !== existing.id) } : s))
      );
      try {
        const res = await fetch(`/api/admin/wishlist/splits/assignments/${existing.id}`, { method: "DELETE" });
        if (!res.ok) {
          const data = await readJsonBody(res).catch(() => ({}));
          setError(data.error || "No se pudo quitar del split.");
          setSplits((prev) =>
            prev.map((s) => (s.id === activeSplit.id ? { ...s, assignments: [...s.assignments, existing] } : s))
          );
        }
      } finally {
        setPendingKey(null);
      }
    } else {
      const tempId = `temp-${key}`;
      const specsForEntry: AssignmentSpecEntry[] = upgrades
        .filter(
          (u) =>
            u.characterId === entry.characterId &&
            u.itemId === entry.itemId &&
            u.bossId === entry.bossId &&
            u.difficulty === entry.difficulty
        )
        .map((u) => ({
          specId: u.specId,
          specName: u.specName,
          specIconUrl: u.specIconUrl,
          upgradePct: u.upgradePct,
          upgradeAbsolute: u.upgradeAbsolute,
          metricType: u.metricType,
        }))
        .sort((a, b) => b.upgradePct - a.upgradePct);
      const optimisticAssignment: SplitAssignment = {
        id: tempId,
        characterId: entry.characterId,
        characterName: entry.characterName,
        characterClass: entry.characterClass,
        characterRealmName: entry.characterRealmName,
        characterRealmSlug: entry.characterRealmSlug,
        itemId: entry.itemId,
        itemName: entry.itemName,
        itemIconUrl: entry.itemIconUrl,
        itemQuality: entry.itemQuality,
        bossId: entry.bossId,
        bossName: entry.bossName,
        bossOrderIndex: entry.bossOrderIndex,
        difficulty: entry.difficulty,
        upgradePct: entry.upgradePct,
        upgradeAbsolute: entry.upgradeAbsolute,
        metricType: entry.metricType,
        specName: entry.specName,
        specIconUrl: entry.specIconUrl,
        specs: specsForEntry,
      };
      setSplits((prev) =>
        prev.map((s) => (s.id === activeSplit.id ? { ...s, assignments: [...s.assignments, optimisticAssignment] } : s))
      );
      try {
        const res = await fetch(`/api/admin/wishlist/splits/${activeSplit.id}/assignments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            characterId: entry.characterId,
            itemId: entry.itemId,
            bossId: entry.bossId,
            difficulty: entry.difficulty,
            upgradePct: entry.upgradePct,
            upgradeAbsolute: entry.upgradeAbsolute,
            metricType: entry.metricType,
            specId: entry.specId,
          }),
        });
        const data = await readJsonBody(res);
        if (!res.ok || !data.assignmentId) {
          setError(data.error || "No se pudo agregar al split.");
          setSplits((prev) =>
            prev.map((s) => (s.id === activeSplit.id ? { ...s, assignments: s.assignments.filter((a) => a.id !== tempId) } : s))
          );
          return;
        }
        setSplits((prev) =>
          prev.map((s) =>
            s.id === activeSplit.id
              ? { ...s, assignments: s.assignments.map((a) => (a.id === tempId ? { ...a, id: data.assignmentId } : a)) }
              : s
          )
        );
      } finally {
        setPendingKey(null);
      }
    }
  }

  async function removeAssignment(assignmentId: string) {
    if (!activeSplit) return;
    const removed = activeSplit.assignments.find((a) => a.id === assignmentId);
    setSplits((prev) =>
      prev.map((s) => (s.id === activeSplit.id ? { ...s, assignments: s.assignments.filter((a) => a.id !== assignmentId) } : s))
    );
    const res = await fetch(`/api/admin/wishlist/splits/assignments/${assignmentId}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await readJsonBody(res).catch(() => ({}));
      setError(data.error || "No se pudo quitar del split.");
      if (removed) {
        setSplits((prev) => (prev.some((s) => s.id === activeSplit.id) ? prev.map((s) => (s.id === activeSplit.id ? { ...s, assignments: [...s.assignments, removed] } : s)) : prev));
      }
    }
  }

  const filtered = upgrades.filter(
    (u) =>
      u.difficulty === difficulty &&
      (roleFilter === "all" || u.specRole === roleFilter) &&
      (classFilter === "all" || u.characterClass === classFilter) &&
      (providerFilter === "all" || u.provider === providerFilter) &&
      (armorFilter === "all" || u.armorCategory === armorFilter) &&
      (tierFilter === "all" || upgradeBadgeTier(u.upgradePct) === tierFilter) &&
      (!hideStale || !u.isStale)
  );

  const topPctByBoss = new Map<string, number>();
  for (const u of filtered) {
    const current = topPctByBoss.get(u.bossId) ?? 0;
    if (u.upgradePct > current) topPctByBoss.set(u.bossId, u.upgradePct);
  }

  if (!hasLoadedOnce) return <p className="text-ink-faint text-sm">Cargando...</p>;

  return (
    <div>
      {error && (
        <div
          className="text-sm rounded-xl p-4 mb-4"
          style={{
            backgroundColor: "color-mix(in srgb, var(--color-danger) 12%, transparent)",
            border: "1px solid color-mix(in srgb, var(--color-danger) 35%, transparent)",
            color: "var(--color-danger)",
          }}
        >
          {error}
        </div>
      )}

      <div className="card p-4 mb-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <Swords className="w-4 h-4 text-ink-faint shrink-0" />
          <button onClick={() => setViewingAll((v) => !v)} className="btn btn-secondary">
            <Eye className="w-4 h-4" /> {viewingAll ? "Volver a editar" : "Ver todos"}
          </button>
          {!viewingAll && splits.length > 0 && (
            <select
              value={activeSplitId ?? ""}
              onChange={(e) => setActiveSplitId(e.target.value)}
              className="input px-3 py-2 text-sm"
            >
              {splits.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.assignments.length})
                </option>
              ))}
            </select>
          )}
          {!viewingAll && activeSplit && !renamingSplit && (
            <>
              <button
                type="button"
                onClick={notifySplit}
                disabled={notifyingSplitId === activeSplit.id}
                title="Publicar en Discord que este split ya está disponible"
                className="btn btn-ghost !px-2.5 !py-1.5 !text-xs"
                style={notifiedSplitId === activeSplit.id ? { color: "var(--color-success)" } : undefined}
              >
                {notifiedSplitId === activeSplit.id ? (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                ) : (
                  <Megaphone className="w-3.5 h-3.5" />
                )}
                {notifyingSplitId === activeSplit.id
                  ? "Notificando..."
                  : notifiedSplitId === activeSplit.id
                    ? "Notificado"
                    : "Notificar"}
              </button>
              <IconAction
                icon={Pencil}
                label="Renombrar split"
                onClick={() => {
                  setRenameValue(activeSplit.name);
                  setRenamingSplit(true);
                }}
              />
              <IconAction icon={Trash2} label="Borrar split" onClick={deleteSplit} className="hover:text-[color:var(--color-danger)]" />
            </>
          )}
          {!viewingAll && renamingSplit && (
            <>
              <input
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && renameSplit()}
                className="input px-3 py-1.5 text-sm"
                autoFocus
              />
              <button onClick={renameSplit} className="btn btn-secondary">
                Guardar
              </button>
              <button onClick={() => setRenamingSplit(false)} className="btn btn-ghost">
                Cancelar
              </button>
            </>
          )}
          {!viewingAll && (
            <div className="flex items-center gap-2 ml-auto">
              <input
                value={newSplitName}
                onChange={(e) => setNewSplitName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && createSplit()}
                placeholder="Nombre del nuevo split"
                className="input px-3 py-1.5 text-sm w-52"
              />
              <button onClick={createSplit} disabled={!newSplitName.trim() || creatingSplit} className="btn btn-primary">
                <Plus className="w-4 h-4" /> Nuevo split
              </button>
            </div>
          )}
        </div>

        {!viewingAll && activeSplit && (
          <div className="mt-4 pt-4" style={{ borderTop: "1px solid var(--color-line)" }}>
            <p className="text-xs text-ink-faint font-semibold mb-2">Resumen de &quot;{activeSplit.name}&quot;</p>
            {activeSplit.assignments.length === 0 ? (
              <p className="text-ink-faint text-sm py-2">Todavía no agregaste ningún ítem a este split.</p>
            ) : (
              <AssignmentGroupsByBoss assignments={activeSplit.assignments} onRemove={removeAssignment} />
            )}
          </div>
        )}
      </div>

      {viewingAll ? (
        <ReadOnlySplitsList splits={splits} loading={loading} />
      ) : !seasonName ? (
        <div className="card p-6 text-center text-ink-muted text-sm">
          No hay ninguna temporada de Wishlist sincronizada todavía -- usa Configuración &gt; Temporada.
        </div>
      ) : (
        <>
          {loading && <p className="text-ink-faint text-sm mb-4">Actualizando...</p>}

          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <DifficultyTabs value={difficulty} onChange={setDifficulty} />
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => setValueMode(valueMode === "pct" ? "abs" : "pct")} className="btn btn-secondary">
                {valueMode === "pct" ? "Ver valor absoluto" : "Ver %"}
              </button>
              <button onClick={() => setGroupByCharacterView(!groupByCharacterView)} className="btn btn-secondary">
                {groupByCharacterView ? "Ver por jefe" : "Ver por personaje"}
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 mb-4">
            <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="input">
              <option value="all">Todos los roles</option>
              <option value="tank">Tank</option>
              <option value="heal">Heal</option>
              <option value="dps">DPS</option>
            </select>
            <select value={classFilter} onChange={(e) => setClassFilter(e.target.value)} className="input">
              <option value="all">Todas las clases</option>
              {ALL_CLASSES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <select value={armorFilter} onChange={(e) => setArmorFilter(e.target.value)} className="input">
              <option value="all">Toda la armadura</option>
              {ARMOR_CATEGORIES.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
            <select value={providerFilter} onChange={(e) => setProviderFilter(e.target.value)} className="input">
              <option value="all">Todos los simuladores</option>
              <option value="raidbots">Raidbots</option>
              <option value="qelive">QE Live</option>
            </select>
            <select value={tierFilter} onChange={(e) => setTierFilter(e.target.value as "all" | UpgradeTier)} className="input">
              <option value="all">Toda calidad</option>
              {UPGRADE_TIERS.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1.5 text-sm text-ink-muted">
              <input type="checkbox" checked={hideStale} onChange={(e) => setHideStale(e.target.checked)} />
              Ocultar sims viejas
            </label>
          </div>

          {groupByCharacterView ? (
            <ByCharacterView
              upgrades={filtered}
              mode={valueMode}
              stateByKey={stateByKey}
              pendingKey={pendingKey}
              disabled={!activeSplit}
              onToggle={toggleAssign}
            />
          ) : (
            <div className="grid gap-4" style={{ gridTemplateColumns: "220px 1fr" }}>
              <BossSidebar bosses={bosses} selectedBossId={selectedBossId} onSelect={setSelectedBossId} topPctByBoss={topPctByBoss} />
              <BossDetail
                boss={bosses.find((b) => b.id === selectedBossId) ?? null}
                upgrades={filtered.filter((u) => u.bossId === selectedBossId)}
                mode={valueMode}
                stateByKey={stateByKey}
                pendingKey={pendingKey}
                disabled={!activeSplit}
                onToggle={toggleAssign}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
