import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  fetchTalentTreeIndex,
  fetchTalentTreeSpells,
  fetchSpellIcon,
  TalentSpellCandidate,
} from "@/lib/blizzard-talents";
import { parseSimcSpellDataDump } from "@/lib/sync/simc-spell-data";
import { CooldownSpellSource } from "./types";
import { mapWithConcurrency } from "./concurrency";

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

const SIMC_BRANCH = "thewarwithin";
const SIMC_DUMP_BASE = `https://raw.githubusercontent.com/simulationcraft/simc/${SIMC_BRANCH}/SpellDataDump`;

function simcFileName(className: string): string {
  return className.replace(/\s+/g, "").toLowerCase();
}

async function fetchSimcDurations(classNames: string[]): Promise<Map<number, number>> {
  const durations = new Map<number, number>();

  await Promise.all(
    Array.from(new Set(classNames)).map(async (className) => {
      try {
        const res = await fetch(`${SIMC_DUMP_BASE}/${simcFileName(className)}.txt`);
        if (!res.ok) return;
        const text = await res.text();
        for (const record of parseSimcSpellDataDump(text)) {
          if (record.durationSeconds !== null) {
            durations.set(record.spellId, Math.round(record.durationSeconds));
          }
        }
      } catch {
      }
    })
  );

  return durations;
}

export interface SpellLibrarySyncResult {
  inserted: number;
  updated: number;
  totalCandidates: number;
}

const UPSERT_BATCH_SIZE = 500;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

export async function syncCooldownSpellCandidates(
  supabase: SupabaseClient,
  region: string
): Promise<SpellLibrarySyncResult> {
  const refs = await fetchTalentTreeIndex(region);
  const treeResults = await Promise.all(refs.map((ref) => fetchTalentTreeSpells(region, ref)));
  const flatCandidates = treeResults.flat();

  const candidatesById = new Map<number, TalentSpellCandidate>();
  for (const candidate of flatCandidates) {
    if (!candidatesById.has(candidate.spellId)) {
      candidatesById.set(candidate.spellId, candidate);
    }
  }

  const durations = await fetchSimcDurations(flatCandidates.map((c) => c.className));

  const existingRows: { spell_id: number; icon_url: string | null }[] = [];
  const PAGE_SIZE = 1000;
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("cooldown_spell_library")
      .select("spell_id, icon_url")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    existingRows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }

  const existingBySpellId = new Map(existingRows.map((r) => [r.spell_id, r.icon_url]));

  const newSpellIds = Array.from(candidatesById.keys()).filter((id) => !existingBySpellId.has(id));
  const needsIconSpellIds = Array.from(candidatesById.keys()).filter(
    (id) => !existingBySpellId.has(id) || !existingBySpellId.get(id)
  );

  const icons = await mapWithConcurrency(needsIconSpellIds, 15, (spellId) => fetchSpellIcon(region, spellId));
  const iconBySpellId = new Map(needsIconSpellIds.map((spellId, idx) => [spellId, icons[idx]]));

  let inserted = 0;
  let updated = 0;

  for (const batch of chunk(newSpellIds, UPSERT_BATCH_SIZE)) {
    const rows = batch.map((spellId) => {
      const candidate = candidatesById.get(spellId)!;
      return {
        spell_id: spellId,
        name: candidate.name,
        icon_url: iconBySpellId.get(spellId) ?? null,
        class: candidate.className,
        spec: candidate.specName,
        duration_seconds: durations.get(spellId) ?? null,
        is_active: true,
        is_categorized: false,
        source: "talent_api" as CooldownSpellSource,
      };
    });
    const { error } = await supabase.from("cooldown_spell_library").insert(rows);
    if (error) throw new Error(error.message);
    inserted += rows.length;
  }

  const existingSpellIds = Array.from(candidatesById.keys()).filter((id) => existingBySpellId.has(id));
  for (const batch of chunk(existingSpellIds, UPSERT_BATCH_SIZE)) {
    const rows = batch.map((spellId) => {
      const candidate = candidatesById.get(spellId)!;
      return {
        spell_id: spellId,
        name: candidate.name,
        class: candidate.className,
        spec: candidate.specName,
        source: "talent_api" as CooldownSpellSource,
        duration_seconds: durations.get(spellId) ?? null,
        icon_url: iconBySpellId.get(spellId) ?? existingBySpellId.get(spellId) ?? null,
        synced_at: new Date().toISOString(),
      };
    });
    const { error } = await supabase.from("cooldown_spell_library").upsert(rows, { onConflict: "spell_id" });
    if (error) throw new Error(error.message);
    updated += rows.length;
  }

  return { inserted, updated, totalCandidates: candidatesById.size };
}
