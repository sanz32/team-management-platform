import { createServerSupabaseClient } from "@/lib/supabase-server";

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

export interface ActiveBreak {
  id: string;
  startsAt: string;
  endsAt: string;
  source: "manual" | "mrt-watcher";
}

export async function getActiveBreak(supabase: SupabaseClient): Promise<ActiveBreak | null> {
  const { data, error } = await supabase
    .from("guild_breaks")
    .select("id, starts_at, ends_at, source")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  if (new Date(data.ends_at).getTime() <= Date.now()) return null;

  return { id: data.id, startsAt: data.starts_at, endsAt: data.ends_at, source: data.source };
}

export async function startBreak(
  supabase: SupabaseClient,
  minutes: number,
  source: "manual" | "mrt-watcher",
  createdBy: string | null
): Promise<ActiveBreak> {
  if (!Number.isFinite(minutes) || minutes <= 0) {
    throw new Error("Los minutos del break deben ser mayores a cero");
  }

  const startsAt = new Date();
  const endsAt = new Date(startsAt.getTime() + minutes * 60_000);

  const { data, error } = await supabase
    .from("guild_breaks")
    .insert({
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      source,
      created_by: createdBy,
    })
    .select("id, starts_at, ends_at, source")
    .single();

  if (error) throw error;

  return { id: data.id, startsAt: data.starts_at, endsAt: data.ends_at, source: data.source };
}

export async function cancelBreak(supabase: SupabaseClient): Promise<void> {
  const active = await getActiveBreak(supabase);
  if (!active) return;

  const { error } = await supabase
    .from("guild_breaks")
    .update({ ends_at: new Date().toISOString() })
    .eq("id", active.id);

  if (error) throw error;
}
