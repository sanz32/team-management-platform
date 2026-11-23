import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getCurrentAppUserId } from "@/lib/current-app-user";
import { validateFrameColor, validateFrameNameStyle } from "@/lib/frame-colors";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));

  const color1Validation = validateFrameColor(body.color1 as string | null | undefined);
  if ("error" in color1Validation) {
    return NextResponse.json({ error: color1Validation.error }, { status: 400 });
  }
  const color2Validation = validateFrameColor(body.color2 as string | null | undefined);
  if ("error" in color2Validation) {
    return NextResponse.json({ error: color2Validation.error }, { status: 400 });
  }
  const nameStyleValidation = validateFrameNameStyle(body.nameStyle as string | null | undefined);
  if ("error" in nameStyleValidation) {
    return NextResponse.json({ error: nameStyleValidation.error }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const appUserId = await getCurrentAppUserId(supabase, session.user);
  if (!appUserId) {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("app_users")
    .update({
      frame_color_1: color1Validation.value,
      frame_color_2: color2Validation.value,
      frame_name_style: nameStyleValidation.value,
    })
    .eq("id", appUserId)
    .select("frame_color_1, frame_color_2, frame_name_style")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    color1: data?.frame_color_1 ?? null,
    color2: data?.frame_color_2 ?? null,
    nameStyle: data?.frame_name_style ?? null,
  });
}
