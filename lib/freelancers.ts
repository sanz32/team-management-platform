import { createServerSupabaseClient } from "@/lib/supabase-server";
import { validateBinanceId } from "@/lib/binance-id";

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;
type Row = Record<string, unknown>;

export interface Freelancer {
  id: string;
  name: string;
  binanceId: string | null;
}

function toFreelancer(row: Row): Freelancer {
  return {
    id: row.id as string,
    name: row.name as string,
    binanceId: (row.binance_id as string | null | undefined) ?? null,
  };
}

export async function listFreelancers(supabase: SupabaseClient): Promise<Freelancer[]> {
  const { data, error } = await supabase.from("freelancers").select("id, name, binance_id").order("name");
  if (error) throw new Error(error.message);
  return (data ?? []).map(toFreelancer);
}

export async function findOrCreateFreelancer(
  supabase: SupabaseClient,
  name: string,
  createdBy: string | null
): Promise<Freelancer> {
  const trimmed = name.trim();

  const { data: existing, error: findError } = await supabase
    .from("freelancers")
    .select("id, name, binance_id")
    .ilike("name", trimmed)
    .maybeSingle();
  if (findError) throw new Error(findError.message);
  if (existing) return toFreelancer(existing);

  const { data: created, error: insertError } = await supabase
    .from("freelancers")
    .insert({ name: trimmed, created_by: createdBy })
    .select("id, name, binance_id")
    .single();

  if (insertError) {
    if ((insertError as { code?: string }).code === "23505") {
      const { data: winner, error: retryError } = await supabase
        .from("freelancers")
        .select("id, name, binance_id")
        .ilike("name", trimmed)
        .maybeSingle();
      if (retryError) throw new Error(retryError.message);
      if (winner) return toFreelancer(winner);
    }
    throw new Error(insertError.message);
  }

  return toFreelancer(created);
}

export async function resolveFreelancerIdsByName(
  supabase: SupabaseClient,
  names: string[],
  createdBy: string | null
): Promise<Map<string, string>> {
  const uniqueNames = Array.from(new Set(names.map((n) => n.trim()).filter(Boolean)));
  const result = new Map<string, string>();
  for (const name of uniqueNames) {
    const freelancer = await findOrCreateFreelancer(supabase, name, createdBy);
    result.set(name, freelancer.id);
  }
  return result;
}

export async function updateFreelancerBinanceId(
  supabase: SupabaseClient,
  id: string,
  binanceId: string | null
): Promise<Freelancer> {
  const validation = validateBinanceId(binanceId);
  if ("error" in validation) throw new Error(validation.error);

  const { data, error } = await supabase
    .from("freelancers")
    .update({ binance_id: validation.value })
    .eq("id", id)
    .select("id, name, binance_id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Freelancer no encontrado");
  return toFreelancer(data);
}
