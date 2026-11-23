"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Database } from "lucide-react";
import { sortCharacters } from "@/lib/characters-sort";
import { useRefetchOnReturn } from "@/lib/useRefetchOnReturn";
import type { RaidDef } from "@/lib/raids";
import type { Character, OwnerGroup, LockoutsResponse } from "../characters/CharactersClient";
import CharacterListPanel from "./CharacterListPanel";
import CharacterDetailPanel from "./CharacterDetailPanel";
import PageHeader from "@/app/components/PageHeader";
import { cachedJson, readCache } from "@/lib/data-cache";

export type ListCharacter = Character & { ownerName?: string };

export type SortKey = "default" | "ilvl" | "rating" | "name";

export default function DatosPersonajesClient({ canSeeAll }: { canSeeAll: boolean }) {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [members, setMembers] = useState<OwnerGroup[]>([]);
  const [raids, setRaids] = useState<RaidDef[]>([]);
  const [currencyIcons, setCurrencyIcons] = useState<Record<number, string>>({});
  const [vaultItemIcons, setVaultItemIcons] = useState<Record<number, string>>({});
  const [syncedSeasonId, setSyncedSeasonId] = useState<number | null>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [loadingMine, setLoadingMine] = useState(true);
  const [loadingAll, setLoadingAll] = useState(canSeeAll);

  const [viewMode, setViewMode] = useState<"personal" | "guild">("personal");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterKey, setFilterKey] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("default");

  function applyShared(data: LockoutsResponse) {
    if (data.currencyIcons) setCurrencyIcons(data.currencyIcons);
    if (data.vaultItemIcons) setVaultItemIcons((prev) => ({ ...prev, ...data.vaultItemIcons }));
    setSyncedSeasonId(data.syncedSeasonId ?? null);
    if (data.myUserId) setMyUserId(data.myUserId);
  }

  function applyMine(data: LockoutsResponse) {
    setCharacters(data.characters ?? []);
    applyShared(data);
  }

  function applyAll(data: LockoutsResponse) {
    setMembers(data.members ?? []);
    applyShared(data);
  }

  async function loadMine() {
    if (!readCache("/api/lockouts?vaultIcons=true")) setLoadingMine(true);
    try {
      const data = await cachedJson<LockoutsResponse>("/api/lockouts?vaultIcons=true", {
        onRevalidated: applyMine,
      });
      if (data) applyMine(data);
    } finally {
      setLoadingMine(false);
    }
  }

  async function loadAll() {
    if (!readCache("/api/lockouts?all=true&vaultIcons=true")) setLoadingAll(true);
    try {
      const data = await cachedJson<LockoutsResponse>("/api/lockouts?all=true&vaultIcons=true", {
        onRevalidated: applyAll,
      });
      if (data) applyAll(data);
    } finally {
      setLoadingAll(false);
    }
  }

  async function loadRaidCatalog() {
    const data = await cachedJson<{ raids?: RaidDef[] }>("/api/raids", { ttlMs: 10 * 60_000 });
    if (data) setRaids(data.raids ?? []);
  }

  function loadEverything() {
    void Promise.all([
      loadMine(),
      canSeeAll ? loadAll() : Promise.resolve(),
      loadRaidCatalog(),
    ]);
  }

  useRefetchOnReturn(loadEverything);

  const scopedCharacters = useMemo<ListCharacter[]>(() => {
    if (viewMode === "guild") {
      return members.flatMap((member) =>
        sortCharacters(member.characters).map((c) => ({
          ...c,
          ownerName: member.discord_username,
        }))
      );
    }
    return sortCharacters(characters);
  }, [viewMode, characters, members]);

  const visibleCharacters = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = scopedCharacters.filter((c) => {
      if (filterKey !== "all") {
        const ownKey = viewMode === "guild" ? c.user_id ?? c.ownerName ?? "unknown" : c.class;
        if (ownKey !== filterKey) return false;
      }
      if (!query) return true;
      const haystack = `${c.name} ${c.realm_slug} ${c.ownerName ?? ""}`.toLowerCase();
      return haystack.includes(query);
    });

    if (sortKey === "default") return filtered;
    return [...filtered].sort((a, b) => {
      if (sortKey === "ilvl") return (b.ilvl ?? -1) - (a.ilvl ?? -1);
      if (sortKey === "rating") {
        return (b.mythic_plus_rating ?? -1) - (a.mythic_plus_rating ?? -1);
      }
      return a.name.localeCompare(b.name, "es");
    });
  }, [scopedCharacters, search, filterKey, sortKey, viewMode]);

  const selected = visibleCharacters.find((c) => c.id === selectedId) ?? visibleCharacters[0] ?? null;
  const loading = viewMode === "guild" ? loadingAll : loadingMine;

  function toggleViewMode() {
    const next = viewMode === "guild" ? "personal" : "guild";
    if (next === "guild" && members.length === 0 && !loadingAll) void loadAll();
    setViewMode(next);
    setSearch("");
    setFilterKey("all");
  }

  return (
    <div>
      <PageHeader
        eyebrow="Progresión"
        icon={Database}
        title="Datos de los personajes"
        description="Gran Vault, mazmorras de la semana, progreso de jefes y monedas, personaje por personaje."
        actions={
          <div className="flex flex-wrap items-center gap-2">
          {canSeeAll && (
            <button type="button" onClick={toggleViewMode} className="btn btn-secondary">
              {viewMode === "guild" ? "Mi vista personal" : "Guild"}
            </button>
          )}
          <Link href="/characters" className="btn btn-secondary">
            <ArrowLeft className="w-3.5 h-3.5" />
            Personajes
          </Link>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-5 items-start">
        <CharacterListPanel
          characters={scopedCharacters}
          visible={visibleCharacters}
          selectedId={selected?.id ?? null}
          onSelect={setSelectedId}
          search={search}
          onSearchChange={setSearch}
          filterKey={filterKey}
          onFilterKeyChange={setFilterKey}
          sortKey={sortKey}
          onSortKeyChange={setSortKey}
          showOwner={viewMode === "guild"}
          loading={loading}
        />

        <CharacterDetailPanel
          character={selected}
          raids={raids}
          currencyIcons={currencyIcons}
          vaultItemIcons={vaultItemIcons}
          syncedSeasonId={syncedSeasonId}
          loading={loading}
          isOwner={!!selected && !!myUserId && selected.user_id === myUserId}
        />
      </div>
    </div>
  );
}
