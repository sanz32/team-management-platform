import { createServerSupabaseClient } from "@/lib/supabase-server";

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

export type FrameNameStyle = "gradient" | "solid" | "none";

const FRAME_NAME_STYLES: FrameNameStyle[] = ["gradient", "solid", "none"];

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export type FrameColorValidation = { value: string | null } | { error: string };

export function validateFrameColor(raw: string | null | undefined): FrameColorValidation {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed) return { value: null };
  if (!HEX_COLOR.test(trimmed)) {
    return { error: "El color debe ser un hex de 6 dígitos, ej. #ff7d0a" };
  }
  return { value: trimmed };
}

export type FrameNameStyleValidation = { value: FrameNameStyle | null } | { error: string };

export function validateFrameNameStyle(raw: string | null | undefined): FrameNameStyleValidation {
  if (raw == null || raw === "") return { value: null };
  if (!FRAME_NAME_STYLES.includes(raw as FrameNameStyle)) {
    return { error: "Estilo de nombre inválido" };
  }
  return { value: raw as FrameNameStyle };
}

export interface MemberFrameColors {
  color1: string | null;
  color2: string | null;
  nameStyle: FrameNameStyle | null;
}

export async function getFrameColorsByUser(
  supabase: SupabaseClient
): Promise<Map<string, MemberFrameColors>> {
  const { data } = await supabase
    .from("app_users")
    .select("id, frame_color_1, frame_color_2, frame_name_style");

  const map = new Map<string, MemberFrameColors>();
  for (const row of data ?? []) {
    map.set(row.id as string, {
      color1: (row.frame_color_1 as string | null) ?? null,
      color2: (row.frame_color_2 as string | null) ?? null,
      nameStyle: (row.frame_name_style as FrameNameStyle | null) ?? null,
    });
  }
  return map;
}
