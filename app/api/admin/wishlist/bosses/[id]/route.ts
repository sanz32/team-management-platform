import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { BOOST_SHOWCASE_TAG } from "@/lib/boost-store";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  if (session.user.appRole !== "admin" && session.user.appRole !== "manager") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const imageUrl: string = typeof body?.imageUrl === "string" ? body.imageUrl.trim() : "";

  if (!imageUrl || !/^https?:\/\//.test(imageUrl)) {
    return NextResponse.json({ error: "La URL de imagen debe empezar con http:// o https://." }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("raid_bosses").update({ image_url: imageUrl }).eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  revalidateTag(BOOST_SHOWCASE_TAG, { expire: 0 });
  return NextResponse.json({ ok: true });
}
