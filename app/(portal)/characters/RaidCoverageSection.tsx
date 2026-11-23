"use client";

import { useEffect, useState } from "react";
import { RefreshCw, Settings2, UserMinus, UserPlus, X } from "lucide-react";
import { raidHeaderImagePosition, type Difficulty, type RaidDef, type RaidKey } from "@/lib/raids";
import { ALL_CLASSES, classSpecs } from "@/lib/wow-classes";
import { formatRelativeTime } from "@/lib/format";
import RoleIcon from "@/app/components/RoleIcon";
import IconAction from "@/app/components/IconAction";
import PillToggle from "@/app/components/PillToggle";
import { CascadeScope, Section, useCascadeSlot } from "./Section";
import { readJsonBody } from "@/lib/read-json";

const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  world: "Mundo",
  normal: "Normal",
  heroic: "Heroico",
  mythic: "Mítico",
};
const ROLE_ORDER = ["tank", "heal", "dps"] as const;

interface CapacityEntry {
  raidKey: string;
  difficulty: Difficulty;
  runs: number;
  limitingReason: string | null;
  tankAvailable: number;
  healAvailable: number;
  dpsAvailable: number;
  tankMainAvailable: number;
  healMainAvailable: number;
  dpsMainAvailable: number;
}

interface ClassRequirementDraft {
  min: number;
  max: number | null;
  spec: string | null;
}

interface ServerClassRequirement {
  class: string;
  min: number;
  max: number | null;
  spec: string | null;
}

interface TemplateDraft {
  raidKey: string;
  difficulty: Difficulty;
  tankCount: number;
  healCount: number;
  dpsCount: number;
  maxSameClass: number | null;
  minIlvl: number | null;
  onlyMains: boolean;
  classRequirements: ServerClassRequirement[];
}

export default function RaidCoverageSection({ canManage }: { canManage: boolean }) {
  const [entries, setEntries] = useState<CapacityEntry[]>([]);
  const [computedAt, setComputedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [raids, setRaids] = useState<RaidDef[]>([]);
  async function loadCapacity() {
    setLoading(true);
    const res = await fetch("/api/admin/raid-capacity");
    const data = await readJsonBody(res).catch(() => ({}));
    setEntries(data.entries ?? []);
    setComputedAt(data.computedAt ?? null);
    setLoading(false);
  }

  useEffect(() => {
    fetch("/api/raids")
      .then((r) => (r.ok ? r.json() : { raids: [] }))
      .then((d) => setRaids(d.raids ?? []));
  }, []);

  async function refreshCapacity() {
    setRefreshing(true);
    try {
      const res = await fetch("/api/admin/raid-capacity/refresh", { method: "POST" });
      const data = await readJsonBody(res).catch(() => ({}));
      if (res.ok) {
        setEntries(data.entries ?? []);
        setComputedAt(data.computedAt ?? null);
      }
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadCapacity();
  }, []);

  const entriesByRaid = new Map<string, CapacityEntry[]>();
  for (const entry of entries) {
    const list = entriesByRaid.get(entry.raidKey) ?? [];
    list.push(entry);
    entriesByRaid.set(entry.raidKey, list);
  }

  return (
    <Section
      eyebrow="Capacidad"
      title="Cobertura de Runs"
      meta={
        loading
          ? undefined
          : computedAt
            ? `actualizado ${formatRelativeTime(computedAt)}`
            : "todavía sin calcular"
      }
      accent="var(--color-success)"
      description="Cuántas runs completas se pueden armar ahora mismo con el pool disponible, según la composición configurada para cada raid y dificultad."
      actions={
        canManage ? (
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={refreshCapacity}
              disabled={refreshing}
              className="flex items-center gap-1.5 text-xs text-ink-faint hover:text-ink transition-colors disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
              {refreshing ? "Actualizando..." : "Actualizar"}
            </button>
            <button
              type="button"
              onClick={() => setConfigOpen((v) => !v)}
              className="flex items-center gap-1.5 text-xs text-ink-faint hover:text-ink transition-colors"
            >
              <Settings2 className="w-3.5 h-3.5" />
              Configuraciones
            </button>
          </div>
        ) : undefined
      }
    >
      {configOpen && canManage && raids.length > 0 && (
        <RaidRunConfigPanel raids={raids} onClose={() => setConfigOpen(false)} onSaved={loadCapacity} />
      )}

      <CascadeScope>
        <div className="flex flex-wrap gap-4">
          {raids.map((raid) => (
            <CascadingRaidCard
              key={raid.key}
              raid={raid}
              loading={loading}
              entries={entriesByRaid.get(raid.key) ?? []}
            />
          ))}
        </div>
      </CascadeScope>
    </Section>
  );
}

function CascadingRaidCard({
  raid,
  loading,
  entries,
}: {
  raid: RaidDef;
  loading: boolean;
  entries: CapacityEntry[];
}) {
  const [cascadeRef, cascadeClass, cascadeDelay] = useCascadeSlot<HTMLDivElement>();
  return (
    <div ref={cascadeRef} className={`flex-1 basis-[280px] ${cascadeClass}`} style={cascadeDelay}>
      <RaidCapacityCard raid={raid} loading={loading} entries={entries} />
    </div>
  );
}

function RaidCapacityCard({
  raid,
  loading,
  entries,
}: {
  raid: RaidDef;
  loading: boolean;
  entries: CapacityEntry[];
}) {
  return (
    <div
      className="card card-hover overflow-hidden h-full flex flex-col"
      style={{ "--card-glow": `color-mix(in srgb, ${raid.color} 35%, transparent)` } as React.CSSProperties}
    >
      <div
        className="h-24 shrink-0 relative flex items-end p-3"
        style={{
          backgroundImage: raid.headerImageUrl
            ? `linear-gradient(180deg, rgba(10,10,14,0.1) 0%, rgba(10,10,14,0.88) 100%), url(${raid.headerImageUrl})`
            : `linear-gradient(160deg, color-mix(in srgb, ${raid.color} 40%, var(--color-surface-2)), var(--color-surface-2))`,
          backgroundSize: "cover",
          backgroundPosition: raidHeaderImagePosition(raid.key),
        }}
      >
        <h3 className="font-heading text-base font-bold text-white drop-shadow-md leading-tight">
          {raid.name}
        </h3>
      </div>

      <div className="p-3.5 flex flex-wrap gap-2.5">
        {raid.difficulties.map((difficulty) => (
          <div key={difficulty} className="flex-1 basis-[220px]">
            <DifficultyRow
              difficulty={difficulty}
              entry={entries.find((e) => e.difficulty === difficulty)}
              loading={loading}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function DifficultyRow({
  difficulty,
  entry,
  loading,
}: {
  difficulty: Difficulty;
  entry?: CapacityEntry;
  loading: boolean;
}) {
  const runs = entry?.runs ?? 0;
  const runColor = loading
    ? "var(--color-ink-faint)"
    : runs > 0
      ? "var(--color-success)"
      : "var(--color-ink-muted)";

  return (
    <div
      className="rounded-lg p-2.5"
      style={{ backgroundColor: "var(--color-surface-2)", border: "1px solid var(--color-line)" }}
    >
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="font-data text-micro uppercase tracking-[0.12em] text-ink-faint">
          {DIFFICULTY_LABEL[difficulty]}
        </span>
        <span className="font-data font-bold text-base leading-none" style={{ color: runColor }}>
          {loading ? "—" : `${runs} run${runs === 1 ? "" : "s"}`}
        </span>
      </div>
      <div className="flex items-center gap-3">
        {ROLE_ORDER.map((role) => {
          const available = entry?.[`${role}Available` as const] ?? 0;
          const mainAvailable = entry?.[`${role}MainAvailable` as const] ?? 0;
          const offSpecAvailable = available - mainAvailable;
          return (
            <span
              key={role}
              className="inline-flex items-center gap-1 text-xs text-ink-muted"
              title={
                !loading && offSpecAvailable > 0
                  ? `${mainAvailable} main + ${offSpecAvailable} Off-Spec`
                  : undefined
              }
            >
              <RoleIcon role={role} size={16} />
              <span className="font-data">{loading ? "—" : available}</span>
            </span>
          );
        })}
      </div>
      {!loading && entry && entry.runs <= 1 && entry.limitingReason && (
        <p className="text-label text-ink-faint mt-1.5 leading-snug">{entry.limitingReason}</p>
      )}
    </div>
  );
}

function templateKey(raidKey: string, difficulty: Difficulty): string {
  return `${raidKey}|${difficulty}`;
}

function classRequirementMap(list: ServerClassRequirement[]): Map<string, ClassRequirementDraft> {
  const map = new Map<string, ClassRequirementDraft>();
  for (const cls of ALL_CLASSES) map.set(cls, { min: 0, max: null, spec: null });
  for (const r of list) map.set(r.class, { min: r.min, max: r.max, spec: r.spec });
  return map;
}

function RaidRunConfigPanel({
  raids,
  onClose,
  onSaved,
}: {
  raids: RaidDef[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [templates, setTemplates] = useState<Record<string, TemplateDraft> | null>(null);
  const [loading, setLoading] = useState(true);
  const [ilvlDefaults, setIlvlDefaults] = useState<Record<"heroic" | "mythic", number> | null>(null);
  const [selectedRaidKey, setSelectedRaidKey] = useState(raids[0].key);
  const [selectedDifficulty, setSelectedDifficulty] = useState<Difficulty>(raids[0].difficulties[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [templatesRes, ilvlRes] = await Promise.all([
        fetch("/api/admin/raid-run-templates"),
        fetch("/api/roster/ilvl-defaults"),
      ]);
      const data = await templatesRes.json().catch(() => ({}));
      const ilvl = await ilvlRes.json().catch(() => ({}));
      const map: Record<string, TemplateDraft> = {};
      for (const t of (data.entries ?? []) as TemplateDraft[]) {
        map[templateKey(t.raidKey, t.difficulty)] = t;
      }
      setTemplates(map);
      if (typeof ilvl.heroic === "number" && typeof ilvl.mythic === "number") {
        setIlvlDefaults({ heroic: ilvl.heroic, mythic: ilvl.mythic });
      }
      setLoading(false);
    })();
  }, []);

  const raid = raids.find((r) => r.key === selectedRaidKey) ?? raids[0];
  const key = templateKey(selectedRaidKey, selectedDifficulty);
  const draft = templates?.[key];
  const requirementByClass = draft ? classRequirementMap(draft.classRequirements) : null;

  function updateDraft(patch: Partial<TemplateDraft>) {
    if (!draft) return;
    setTemplates((prev) => (prev ? { ...prev, [key]: { ...draft, ...patch } } : prev));
  }

  function updateClassRequirement(className: string, patch: Partial<ClassRequirementDraft>) {
    if (!draft || !requirementByClass) return;
    const current = requirementByClass.get(className) ?? { min: 0, max: null, spec: null };
    const next = new Map(requirementByClass);
    next.set(className, { ...current, ...patch });
    updateDraft({
      classRequirements: Array.from(next.entries()).map(([cls, r]) => ({ class: cls, ...r })),
    });
  }

  function selectRaid(nextRaidKey: RaidKey) {
    const nextRaid = raids.find((r) => r.key === nextRaidKey) ?? raids[0];
    setSelectedRaidKey(nextRaidKey);
    if (!nextRaid.difficulties.includes(selectedDifficulty)) {
      setSelectedDifficulty(nextRaid.difficulties[0]);
    }
  }

  async function handleSave() {
    if (!draft) return;
    setSaving(true);
    setError("");
    setSavedFlash(false);
    try {
      const body = {
        ...draft,
        classRequirements: draft.classRequirements.filter((r) => r.min > 0 || r.max != null),
      };
      const res = await fetch("/api/admin/raid-run-templates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await readJsonBody(res).catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "No se pudo guardar.");
        return;
      }
      setTemplates((prev) => (prev ? { ...prev, [key]: data.template } : prev));
      setSavedFlash(true);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card p-4 mb-5">
      <div className="flex items-start justify-between gap-3 mb-3.5">
        <div>
          <h3 className="font-heading text-sm font-bold text-ink">Composición esperada por raid</h3>
          <p className="text-ink-faint text-xs">
            Los mismos parámetros que usa el roster automático -- roles, ilvl mínimo, clases específicas
            -- para calcular cuántas runs completas entran con el pool disponible.
          </p>
        </div>
        <button type="button" onClick={onClose} className="text-ink-faint hover:text-ink transition-colors shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>

      {loading || !draft || !requirementByClass ? (
        <p className="text-ink-faint text-xs py-2">Cargando...</p>
      ) : (
        <div className="flex flex-col gap-3.5">
          <div className="flex flex-wrap items-center gap-2">
            {raids.map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={() => selectRaid(r.key)}
                className="px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                style={
                  r.key === selectedRaidKey
                    ? { backgroundColor: "var(--color-surface-2)", border: "1px solid var(--color-line-strong)", color: "var(--color-ink)" }
                    : { border: "1px solid transparent", color: "var(--color-ink-muted)" }
                }
              >
                {r.name}
              </button>
            ))}
            <span className="w-px h-5 mx-1" style={{ backgroundColor: "var(--color-line)" }} />
            {raid.difficulties.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setSelectedDifficulty(d)}
                className="px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                style={
                  d === selectedDifficulty
                    ? { backgroundColor: "var(--color-primary)", color: "var(--color-canvas)" }
                    : { border: "1px solid var(--color-line)", color: "var(--color-ink-muted)" }
                }
              >
                {DIFFICULTY_LABEL[d]}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <NumberField
              label="Tanks"
              value={draft.tankCount}
              onChange={(v) => updateDraft({ tankCount: v === "" ? 0 : v })}
            />
            <NumberField
              label="Heals"
              value={draft.healCount}
              onChange={(v) => updateDraft({ healCount: v === "" ? 0 : v })}
            />
            <NumberField
              label="DPS"
              value={draft.dpsCount}
              onChange={(v) => updateDraft({ dpsCount: v === "" ? 0 : v })}
            />
            <NumberField
              label="Tope de clase repetida"
              value={draft.maxSameClass ?? ""}
              placeholder="Sin tope"
              onChange={(v) => updateDraft({ maxSameClass: v === "" ? null : Number(v) })}
            />
            <NumberField
              label="Ilvl mínimo"
              value={draft.minIlvl ?? ""}
              placeholder={
                ilvlDefaults && (selectedDifficulty === "heroic" || selectedDifficulty === "mythic")
                  ? `Roster: ${ilvlDefaults[selectedDifficulty]}`
                  : "Usa el de Roster"
              }
              onChange={(v) => updateDraft({ minIlvl: v === "" ? null : Number(v) })}
            />
          </div>

          <div>
            <PillToggle
              checked={draft.onlyMains}
              onChange={(v) => updateDraft({ onlyMains: v })}
              label="Solo Mains"
            />
            <p className="text-ink-faint text-label mt-1">
              Con esto activo, un personaje que solo cubre un rol por una Off-Spec (no por su rol
              principal) no cuenta ni se usa para armar una run acá -- ni en &quot;disponibles&quot; ni
              en las runs calculadas.
            </p>
          </div>

          <div>
            <span className="text-xs font-semibold text-ink-muted">Clases específicas requeridas</span>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5 mt-1.5">
              {ALL_CLASSES.map((cls) => (
                <ClassRequirementRow
                  key={cls}
                  className={cls}
                  requirement={requirementByClass.get(cls) ?? { min: 0, max: null, spec: null }}
                  onChange={(patch) => updateClassRequirement(cls, patch)}
                />
              ))}
            </div>
          </div>

          {error && (
            <p className="text-xs" style={{ color: "var(--color-danger)" }}>
              {error}
            </p>
          )}

          <div className="flex items-center gap-3">
            <button onClick={handleSave} disabled={saving} className="btn btn-primary self-start !px-4 !py-1.5 text-xs">
              {saving ? "Guardando..." : "Guardar"}
            </button>
            {savedFlash && !saving && (
              <span className="text-xs" style={{ color: "var(--color-success)" }}>
                Guardado.
              </span>
            )}
          </div>
        </div>
      )}

      <div className="mt-4 pt-4" style={{ borderTop: "1px solid var(--color-line)" }}>
        <ExcludedMembersPanel />
      </div>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: number | "";
  onChange: (value: number | "") => void;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-micro uppercase tracking-wide text-ink-faint font-data">{label}</span>
      <input
        type="number"
        min={0}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
        className="input px-2.5 py-1.5 text-sm w-28"
      />
    </label>
  );
}

function ClassRequirementRow({
  className,
  requirement,
  onChange,
}: {
  className: string;
  requirement: ClassRequirementDraft;
  onChange: (patch: Partial<ClassRequirementDraft>) => void;
}) {
  const specs = classSpecs(className);
  const active = requirement.min > 0 || requirement.max != null;

  return (
    <div
      className="flex flex-wrap items-center gap-2 rounded-lg p-2"
      style={{
        backgroundColor: "var(--color-surface-2)",
        border: active ? "1px solid var(--color-line-strong)" : "1px solid transparent",
      }}
    >
      <span className="text-xs font-semibold text-ink w-28 shrink-0">{className}</span>

      {specs.length > 0 && (
        <select
          value={requirement.spec ?? ""}
          onChange={(e) => onChange({ spec: e.target.value || null })}
          className="input px-2 py-1.5 text-xs w-32"
        >
          <option value="">Cualquier spec</option>
          {specs.map((spec) => (
            <option key={spec} value={spec}>
              {spec}
            </option>
          ))}
        </select>
      )}

      <label className="flex items-center gap-1.5 text-xs text-ink-muted">
        Mín.
        <input
          type="number"
          min={0}
          value={requirement.min}
          onChange={(e) => onChange({ min: Number(e.target.value) })}
          className="input px-2 py-1 text-xs w-14"
        />
      </label>

      <label className="flex items-center gap-1.5 text-xs text-ink-muted">
        Máx.
        <input
          type="number"
          min={requirement.min}
          value={requirement.max ?? ""}
          placeholder="Sin tope"
          onChange={(e) => onChange({ max: e.target.value === "" ? null : Number(e.target.value) })}
          className="input px-2 py-1 text-xs w-16"
        />
      </label>
    </div>
  );
}

interface ExcludedMember {
  userId: string;
  discordUsername: string;
  note: string | null;
}

interface MemberOption {
  id: string;
  discord_username: string;
}

function ExcludedMembersPanel() {
  const [members, setMembers] = useState<ExcludedMember[] | null>(null);
  const [allMembers, setAllMembers] = useState<MemberOption[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      const [membersRes, allRes] = await Promise.all([
        fetch("/api/admin/raid-run-excluded-members"),
        fetch("/api/members"),
      ]);
      const data = await membersRes.json().catch(() => ({}));
      const all = await allRes.json().catch(() => ({}));
      if (!membersRes.ok) {
        setError(data.error || "No se pudo cargar la lista de excluidos.");
        setMembers([]);
      } else {
        setMembers(data.members ?? []);
      }
      setAllMembers(all.members ?? []);
    })();
  }, []);

  const excludedIds = new Set((members ?? []).map((m) => m.userId));
  const availableOptions = allMembers.filter((m) => !excludedIds.has(m.id));

  async function handleExclude() {
    if (!selectedUserId) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/raid-run-excluded-members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: selectedUserId }),
      });
      const data = await readJsonBody(res).catch(() => ({}));
      if (res.ok) {
        setMembers(data.members ?? []);
        setSelectedUserId("");
      } else {
        setError(data.error || "No se pudo excluir al miembro.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleInclude(userId: string) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/raid-run-excluded-members", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const data = await readJsonBody(res).catch(() => ({}));
      if (res.ok) {
        setMembers(data.members ?? []);
      } else {
        setError(data.error || "No se pudo volver a incluir al miembro.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-1.5">
        <span className="text-xs font-semibold text-ink-muted">Miembros no disponibles</span>
        <p className="text-ink-faint text-label mt-0.5">
          Sácalos de acá cuando no estén disponibles por algún motivo puntual (aparte de día libre o
          miembro eliminado) y vuelve a incluirlos cuando corresponda -- no se quita solo.
        </p>
      </div>

      {members === null ? (
        <p className="text-ink-faint text-xs py-1">Cargando...</p>
      ) : (
        <div className="flex flex-col gap-2">
          {members.length === 0 ? (
            <p className="text-ink-faint text-xs py-1">Todos los miembros están disponibles.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {members.map((m) => (
                <span
                  key={m.userId}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs"
                  style={{ backgroundColor: "var(--color-surface-2)", border: "1px solid var(--color-line)" }}
                >
                  <UserMinus className="w-3 h-3" style={{ color: "var(--color-danger)" }} />
                  {m.discordUsername}
                  <IconAction
                    icon={X}
                    label="Volver a incluir"
                    onClick={() => handleInclude(m.userId)}
                    disabled={busy}
                    className="hover:text-[color:var(--color-success)]"
                  />
                </span>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2">
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="input px-2 py-1.5 text-xs w-48"
            >
              <option value="">Elige un miembro...</option>
              {availableOptions.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.discord_username}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleExclude}
              disabled={!selectedUserId || busy}
              className="flex items-center gap-1 text-xs text-ink-faint hover:text-ink transition-colors disabled:opacity-50"
            >
              <UserPlus className="w-3.5 h-3.5" />
              Excluir
            </button>
          </div>

          {error && (
            <p className="text-xs" style={{ color: "var(--color-danger)" }}>
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
