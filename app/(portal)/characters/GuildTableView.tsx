"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { capitalize } from "@/lib/format";
import { sortCharacters } from "@/lib/characters-sort";
import { classColor } from "@/lib/wow-classes";
import { bossKey, TRACKED_LOCKOUT_DIFFICULTIES, type Difficulty, type RaidDef } from "@/lib/raids";
import { worstDebtForUser, type MemberGoalDebt } from "@/lib/goal-progress";
import GoalDebtBadge from "@/app/components/GoalDebtBadge";
import TierSetBadge from "@/app/components/TierSetBadge";
import PillToggle from "@/app/components/PillToggle";
import MemberAvatar, { memberNameProps } from "./MemberAvatar";
import { CascadeScope, useCascadeSlot } from "./Section";
import { characterTooltip } from "./character-tooltip";
import { openCharacterLink, type Character, type OwnerGroup } from "./CharactersClient";

const TRACKED_DIFFICULTIES = TRACKED_LOCKOUT_DIFFICULTIES;

const DIFFICULTY_ABBR: Record<string, string> = { normal: "N", heroic: "HC", mythic: "M" };
const DIFFICULTY_LABEL: Record<string, string> = { normal: "Normal", heroic: "Heroico", mythic: "Mítico" };

interface LockoutDot {
  raid: RaidDef;
  difficulty: Difficulty;
}

function raidDots(raids: RaidDef[]): LockoutDot[][] {
  return raids.map((raid) =>
    TRACKED_DIFFICULTIES.filter((d) => raid.difficulties.includes(d)).map((difficulty) => ({
      raid,
      difficulty,
    }))
  );
}

function isSaved(character: Character, raid: RaidDef, difficulty: Difficulty): boolean {
  return raid.bosses.some((_, i) => character.kills.includes(bossKey(raid.key, difficulty, i + 1)));
}

function averageIlvl(characters: Character[]): number | null {
  const withIlvl = characters.filter((c) => c.ilvl);
  if (withIlvl.length === 0) return null;
  return Math.round(withIlvl.reduce((sum, c) => sum + (c.ilvl ?? 0), 0) / withIlvl.length);
}

function LockoutDotView({
  raid,
  difficulty,
  saved,
}: {
  raid: RaidDef;
  difficulty: Difficulty;
  saved: boolean;
}) {
  const color = saved ? "var(--color-danger)" : "var(--color-success)";
  return (
    <span
      title={`${raid.name} (${DIFFICULTY_LABEL[difficulty]}) — ${saved ? "Saveado" : "Libre"}`}
      className="block rounded-full"
      style={{
        width: 6,
        height: 6,
        backgroundColor: `color-mix(in srgb, ${color} 88%, transparent)`,
        boxShadow: `0 0 0 1px var(--color-surface-2), 0 0 0 2px color-mix(in srgb, ${raid.color} 75%, transparent)`,
      }}
    />
  );
}

function CharacterChip({
  character,
  dotGroups,
  showTier,
}: {
  character: Character;
  dotGroups: LockoutDot[][];
  showTier: boolean;
}) {
  const color = classColor(character.class);
  return (
    <Link
      href={`/characters/${character.id}?from=admin`}
      onClick={openCharacterLink}
      prefetch={false}
      title={characterTooltip(character)}
      className="hover-surface inline-flex items-center gap-2 rounded-md py-1 pr-2 pl-2 transition-colors"
      style={{
        backgroundColor: "var(--color-surface-2)",
        borderTop: "1px solid var(--color-line)",
        borderRight: "1px solid var(--color-line)",
        borderBottom: "1px solid var(--color-line)",
        borderLeft: `2px solid ${color}`,
      }}
    >
      <span className="truncate max-w-[104px] text-label font-semibold leading-none" style={{ color }}>
        {capitalize(character.name)}
      </span>
      <span className="font-data text-label leading-none" style={{ color: "var(--color-gold)" }}>
        {character.ilvl ?? "—"}
      </span>
      {showTier && (
        <TierSetBadge
          count={character.tier_piece_count}
          sets={character.tier_pieces}
          legacySetName={character.tier_set_name}
        />
      )}

      {dotGroups.length > 0 && (
        <span className="flex items-center gap-[11px]">
          {dotGroups.map((group, i) => (
            <span key={i} className="flex items-center gap-[6px]">
              {group.map((dot) => (
                <LockoutDotView
                  key={dot.difficulty}
                  raid={dot.raid}
                  difficulty={dot.difficulty}
                  saved={isSaved(character, dot.raid, dot.difficulty)}
                />
              ))}
            </span>
          ))}
        </span>
      )}
    </Link>
  );
}

function DotLegend({ raids }: { raids: RaidDef[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-label text-ink-faint">
      {raids.map((raid) => (
        <span key={raid.key} className="inline-flex items-center gap-1.5" title={raid.name}>
          <span className="font-data font-bold" style={{ color: raid.color }}>
            {raid.abbr}
          </span>
          <span className="font-data">
            {TRACKED_DIFFICULTIES.filter((d) => raid.difficulties.includes(d))
              .map((d) => DIFFICULTY_ABBR[d])
              .join(" · ")}
          </span>
        </span>
      ))}
      <span className="inline-flex items-center gap-3">
        {(
          [
            ["var(--color-success)", "libre"],
            ["var(--color-danger)", "saveado"],
          ] as const
        ).map(([color, label]) => (
          <span key={label} className="inline-flex items-center gap-1.5">
            <span
              className="block rounded-full"
              style={{
                width: 6,
                height: 6,
                backgroundColor: `color-mix(in srgb, ${color} 88%, transparent)`,
              }}
            />
            {label}
          </span>
        ))}
      </span>
    </div>
  );
}

function MemberTableRow({
  group,
  dotGroups,
  debt,
  showTier,
}: {
  group: OwnerGroup;
  dotGroups: LockoutDot[][];
  debt: MemberGoalDebt | null;
  showTier: boolean;
}) {
  const [cascadeRef, cascadeClass, cascadeDelay] = useCascadeSlot<HTMLTableRowElement>();
  const ilvl = averageIlvl(group.characters);
  const nameProps = memberNameProps(
    group.has_app,
    group.frame_name_style as "gradient" | "solid" | "none" | null,
    group.frame_color_1,
    group.frame_color_2
  );
  return (
    <tr
      ref={cascadeRef}
      className={`border-t border-line transition-colors hover:bg-surface-2 ${cascadeClass}`}
      style={cascadeDelay}
    >
      <td className="align-top px-4 py-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <MemberAvatar
            group={group}
            size={28}
            hasApp={group.has_app}
            accent1={group.frame_color_1}
            accent2={group.frame_color_2}
          />
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 min-w-0 text-meta font-semibold text-ink leading-tight">
              <span className={`truncate ${nameProps?.className ?? ""}`} style={nameProps?.style}>
                {group.discord_username}
              </span>
              <GoalDebtBadge debt={debt} />
            </p>
            <p className="font-data text-micro text-ink-faint mt-0.5">
              {group.characters.length} pj
              {ilvl !== null && ` · ilvl ${ilvl}`}
            </p>
          </div>
        </div>
      </td>
      <td className="align-top px-4 py-3">
        {group.characters.length === 0 ? (
          <span className="text-ink-faint text-xs">Sin personajes registrados.</span>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {sortCharacters(group.characters).map((c) => (
              <CharacterChip key={c.id} character={c} dotGroups={dotGroups} showTier={showTier} />
            ))}
          </div>
        )}
      </td>
    </tr>
  );
}

export default function GuildTableView({
  members,
  loading,
  raids,
  goalDebts,
}: {
  members: OwnerGroup[];
  loading: boolean;
  raids: RaidDef[];
  goalDebts: MemberGoalDebt[];
}) {
  const [search, setSearch] = useState("");
  const [showLockouts, setShowLockouts] = useState(false);
  const [showTier, setShowTier] = useState(false);

  const allDotGroups = useMemo(() => raidDots(raids), [raids]);
  const dotGroups = showLockouts ? allDotGroups : [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return members;
    return members.filter(
      (g) =>
        g.discord_username.toLowerCase().includes(q) ||
        g.characters.some((c) => c.name.toLowerCase().includes(q))
    );
  }, [members, search]);

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-3 border-b border-line">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar miembro o personaje..."
          className="input px-3 py-2 text-sm w-full sm:w-[280px]"
          aria-label="Buscar miembro o personaje"
        />
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          {showLockouts && <DotLegend raids={raids} />}
          <PillToggle checked={showTier} onChange={setShowTier} label="Mostrar tier" />
          <PillToggle checked={showLockouts} onChange={setShowLockouts} label="Mostrar lockouts" />
        </div>
      </div>

      <div className="max-h-[75vh] overflow-auto">
        <table className="w-full text-sm" style={{ minWidth: 620 }}>
          <thead className="text-ink-faint text-xs uppercase tracking-wide">
            <tr>
              <th
                className="sticky top-0 z-[1] text-left px-4 py-2.5 font-semibold border-b border-line w-[220px]"
                style={{ backgroundColor: "var(--color-surface)" }}
              >
                Miembro
              </th>
              <th
                className="sticky top-0 z-[1] text-left px-4 py-2.5 font-semibold border-b border-line"
                style={{ backgroundColor: "var(--color-surface)" }}
              >
                Personajes
              </th>
            </tr>
          </thead>
          <CascadeScope once>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={2} className="px-4 py-16 text-center text-ink-faint text-sm">
                    Cargando personajes...
                  </td>
                </tr>
              )}
              {!loading &&
                filtered.map((g) => (
                  <MemberTableRow
                    key={g.user_id}
                    group={g}
                    dotGroups={dotGroups}
                    debt={worstDebtForUser(goalDebts, g.user_id)}
                    showTier={showTier}
                  />
                ))}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={2} className="px-4 py-16 text-center text-ink-faint text-sm">
                    {members.length === 0 ? "Todavía no hay miembros." : "Sin resultados."}
                  </td>
                </tr>
              )}
            </tbody>
          </CascadeScope>
        </table>
      </div>
    </div>
  );
}
