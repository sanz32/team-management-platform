import { createServerSupabaseClient } from "./supabase-server";
import { fetchPlayableSpecializationIndex, fetchPlayableSpecializationDetail } from "./blizzard";

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

export interface WowSpecialization {
  specId: number;
  className: string;
  specName: string;
  role: "tank" | "heal" | "dps";
  iconUrl: string | null;
}

function rowToSpec(row: {
  spec_id: number;
  class_name: string;
  spec_name: string;
  role: string;
  icon_url: string | null;
}): WowSpecialization {
  return {
    specId: row.spec_id,
    className: row.class_name,
    specName: row.spec_name,
    role: row.role as "tank" | "heal" | "dps",
    iconUrl: row.icon_url,
  };
}

async function ensureAllSpecsCached(supabase: SupabaseClient, region: string): Promise<WowSpecialization[]> {
  const { data: cached } = await supabase.from("wow_specializations").select("*");
  if (cached && cached.length > 0) return cached.map(rowToSpec);

  const index = await fetchPlayableSpecializationIndex(region);
  const details = await Promise.all(index.map((s) => fetchPlayableSpecializationDetail(region, s.specId)));
  const resolved = details.filter((d): d is NonNullable<typeof d> => d !== null);

  await supabase.from("wow_specializations").upsert(
    resolved.map((d) => ({
      spec_id: d.specId,
      class_name: d.className,
      spec_name: d.specName,
      role: d.role,
      icon_url: d.iconUrl,
    })),
    { onConflict: "spec_id" }
  );

  return resolved.map((d) => ({
    specId: d.specId,
    className: d.className,
    specName: d.specName,
    role: d.role,
    iconUrl: d.iconUrl,
  }));
}

export function matchSpecByProviderText(
  allSpecs: WowSpecialization[],
  className: string,
  providerSpecText: string
): WowSpecialization | null {
  const classSpecs = allSpecs.filter((s) => s.className === className);
  const foldedText = providerSpecText.toLowerCase();
  return classSpecs.find((s) => foldedText.includes(s.specName.toLowerCase())) ?? null;
}

export async function resolveSpecFromProviderString(
  supabase: SupabaseClient,
  region: string,
  className: string,
  providerSpecText: string
): Promise<WowSpecialization | null> {
  const all = await ensureAllSpecsCached(supabase, region);
  return matchSpecByProviderText(all, className, providerSpecText);
}
