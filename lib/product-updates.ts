import { createServerSupabaseClient } from "./supabase-server";

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

export interface PendingUpdate {
  id: string;
  title: string;
  message: string;
  featurePath: string;
  imageUrl: string | null;
  createdAt: string;
  showToast: boolean;
  showBadge: boolean;
}

export async function getPendingUpdate(
  supabase: SupabaseClient,
  appUser: { dismissed_update_id: string | null; visited_update_id: string | null }
): Promise<PendingUpdate | null> {
  const { data: latest } = await supabase
    .from("product_updates")
    .select("id, title, message, feature_path, image_url, created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!latest) return null;

  const showToast = latest.id !== appUser.dismissed_update_id;
  const showBadge = latest.id !== appUser.visited_update_id;

  if (!showToast && !showBadge) return null;

  return {
    id: latest.id,
    title: latest.title,
    message: latest.message,
    featurePath: latest.feature_path,
    imageUrl: latest.image_url,
    createdAt: latest.created_at,
    showToast,
    showBadge,
  };
}
