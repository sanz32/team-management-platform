import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { requestRefresh } from "@/lib/boost-refresh-signal";

export async function POST() {
  try {
    const supabase = createServerSupabaseClient();
    const { requested, pending } = await requestRefresh(supabase);
    return NextResponse.json({ ok: true, requested, pending });
  } catch (err) {
    console.error("No se pudo pedir un refresco de cupos:", err);
    return NextResponse.json({ ok: false });
  }
}
