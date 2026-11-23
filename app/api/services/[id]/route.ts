import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { computeCutRows } from "@/lib/service-cuts";
import { resolveFreelancerIdsByName } from "@/lib/freelancers";
import { getCurrentAppUserId } from "@/lib/current-app-user";
import { hasAnyPaidCuts } from "@/lib/payouts";
import { parseBoosters } from "../route";

const ALREADY_PAID_ERROR =
  "Esta run ya tiene pagos confirmados -- deshaz el pago desde Pagos (/balance) antes de editarla o eliminarla, para no perder ese registro.";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const appRole = session.user.appRole;
  if (appRole !== "admin" && appRole !== "manager") {
    return NextResponse.json(
      { error: "Solo el líder o los managers pueden editar runs" },
      { status: 403 }
    );
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const { description, advUserId, pot, boosters: boostersRaw, advCutPercent } = body as {
    description?: string;
    advUserId?: string;
    pot?: number;
    boosters?: unknown;
    advCutPercent?: number;
  };

  if (!description || !pot || pot <= 0) {
    return NextResponse.json({ error: "Run y Pot son obligatorios" }, { status: 400 });
  }

  const parsed = parseBoosters(boostersRaw);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const cutPercent = advCutPercent ?? 20;
  if (Number.isNaN(cutPercent) || cutPercent < 0 || cutPercent > 100) {
    return NextResponse.json({ error: "El % de ADV tiene que estar entre 0 y 100" }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();

  const { data: service, error: fetchError } = await supabase
    .from("services_sold")
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
  if (!service) return NextResponse.json({ error: "Run no encontrada" }, { status: 404 });

  if (await hasAnyPaidCuts(supabase, id)) {
    return NextResponse.json({ error: ALREADY_PAID_ERROR }, { status: 400 });
  }

  const { error: updateError } = await supabase
    .from("services_sold")
    .update({ description, total_price: pot, adv_user_id: advUserId || null, adv_cut_percent: cutPercent })
    .eq("id", id);

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  const { error: deleteError } = await supabase.from("service_cuts").delete().eq("service_id", id);
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

  const createdBy = await getCurrentAppUserId(supabase, session.user);
  const freelanceNames = parsed.boosters.filter((b) => b.freelanceName).map((b) => b.freelanceName as string);
  const freelancerIdByName = await resolveFreelancerIdsByName(supabase, freelanceNames, createdBy);

  const cutRows = computeCutRows(pot, advUserId || null, parsed.boosters, cutPercent).map((c) => ({
    service_id: id,
    ...c,
    freelancer_id: c.freelance_name ? (freelancerIdByName.get(c.freelance_name) ?? null) : null,
  }));

  const { error: cutsError } = await supabase.from("service_cuts").insert(cutRows);
  if (cutsError) return NextResponse.json({ error: cutsError.message }, { status: 500 });

  return NextResponse.json({ success: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const appRole = session.user.appRole;
  if (appRole !== "admin" && appRole !== "manager") {
    return NextResponse.json(
      { error: "Solo el líder o los managers pueden eliminar runs" },
      { status: 403 }
    );
  }

  const { id } = await params;
  const supabase = createServerSupabaseClient();

  if (await hasAnyPaidCuts(supabase, id)) {
    return NextResponse.json({ error: ALREADY_PAID_ERROR }, { status: 400 });
  }

  const { error } = await supabase.from("services_sold").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
