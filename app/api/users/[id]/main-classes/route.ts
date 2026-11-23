import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { ALL_CLASSES } from "@/lib/wow-classes";
import { MAX_MAIN_CLASSES, refreshAutoMainClasses } from "@/lib/main-classes";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { id } = await params;
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("user_main_classes")
    .select("class, source")
    .eq("user_id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    classes: (data ?? []).map((r) => r.class as string),
    source: (data ?? []).some((r) => r.source === "manual") ? "manual" : "auto",
  });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const appRole = session.user.appRole;
  if (appRole !== "admin" && appRole !== "manager") {
    return NextResponse.json(
      { error: "Solo el líder o los managers pueden cambiar las clases main" },
      { status: 403 }
    );
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const { classes } = body as { classes?: unknown };

  const supabase = createServerSupabaseClient();

  if (classes === null) {
    await supabase.from("user_main_classes").delete().eq("user_id", id);
    await refreshAutoMainClasses(supabase);
    return NextResponse.json({ classes: null, source: "auto" });
  }

  if (!Array.isArray(classes) || classes.some((c) => !ALL_CLASSES.includes(c as string))) {
    return NextResponse.json({ error: "Lista de clases inválida" }, { status: 400 });
  }
  if (classes.length === 0) {
    return NextResponse.json(
      { error: "Elige al menos una clase, o quita la marca para volver al cálculo automático" },
      { status: 400 }
    );
  }
  if (classes.length > MAX_MAIN_CLASSES) {
    return NextResponse.json(
      { error: `Como mucho ${MAX_MAIN_CLASSES} clases main` },
      { status: 400 }
    );
  }

  const unique = [...new Set(classes as string[])];

  await supabase.from("user_main_classes").delete().eq("user_id", id);
  const { error } = await supabase.from("user_main_classes").insert(
    unique.map((cls) => ({
      user_id: id,
      class: cls,
      source: "manual",
      updated_at: new Date().toISOString(),
    }))
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ classes: unique, source: "manual" });
}
