import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { computeCutRows, BoosterShare } from "@/lib/service-cuts";
import { resolveFreelancerIdsByName } from "@/lib/freelancers";

export interface BoosterCutOut {
  user_id: string | null;
  discord_username: string;
  is_freelance: boolean;
  cut_percent: number;
  cut_amount: number;
  paid: boolean;
}

export function parseBoosters(raw: unknown): { boosters: BoosterShare[] } | { error: string } {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { error: "Selecciona al menos un booster." };
  }

  const boosters: BoosterShare[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") return { error: "Booster inválido." };
    const { userId, freelanceName, cutPercent } = entry as {
      userId?: string | null;
      freelanceName?: string | null;
      cutPercent?: number;
    };

    const percent = cutPercent ?? 100;
    if (typeof percent !== "number" || Number.isNaN(percent) || percent < 0 || percent > 100) {
      return { error: "El % de cut de cada booster tiene que estar entre 0 y 100." };
    }

    if (userId) {
      boosters.push({ userId, freelanceName: null, cutPercent: percent });
    } else if (freelanceName && freelanceName.trim()) {
      boosters.push({ userId: null, freelanceName: freelanceName.trim(), cutPercent: percent });
    } else {
      return { error: "Todo participante Freelance necesita un nombre." };
    }
  }

  return { boosters };
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const discordId = session.user.discordId;
  const appRole = session.user.appRole;
  const canManage = appRole === "admin" || appRole === "manager";
  const wantsAll = req.nextUrl.searchParams.get("all") === "true";

  const supabase = createServerSupabaseClient();

  const { data: appUser } = await supabase
    .from("app_users")
    .select("id")
    .eq("discord_id", discordId)
    .single();

  if (!appUser) {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  }

  const { data: members } = await supabase.from("app_users").select("id, discord_username, nickname");
  const nameById = new Map(
    (members ?? []).map((m) => [m.id, (m.nickname ?? m.discord_username) as string])
  );

  if (wantsAll && canManage) {
    const { data: services, error } = await supabase
      .from("services_sold")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const serviceIds = (services ?? []).map((s) => s.id);
    let cuts: {
      service_id: string;
      user_id: string | null;
      freelance_name: string | null;
      cut_percent: number;
      cut_amount: number;
      paid: boolean;
    }[] = [];
    if (serviceIds.length > 0) {
      const { data } = await supabase
        .from("service_cuts")
        .select("service_id, user_id, freelance_name, cut_percent, cut_amount, paid")
        .in("service_id", serviceIds);
      cuts = data ?? [];
    }

    const cutsByService = new Map<string, BoosterCutOut[]>();
    for (const c of cuts) {
      const list = cutsByService.get(c.service_id) ?? [];
      list.push({
        user_id: c.user_id,
        discord_username: c.user_id ? nameById.get(c.user_id) ?? "Desconocido" : c.freelance_name ?? "Freelance",
        is_freelance: !c.user_id,
        cut_percent: Number(c.cut_percent),
        cut_amount: Number(c.cut_amount),
        paid: c.paid,
      });
      cutsByService.set(c.service_id, list);
    }

    const withDetails = (services ?? []).map((s) => ({
      ...s,
      adv_username: s.adv_user_id ? nameById.get(s.adv_user_id) ?? "Desconocido" : null,
      boosters: cutsByService.get(s.id) ?? [],
    }));

    const myTotal = cuts
      .filter((c) => c.user_id === appUser.id && !c.paid)
      .reduce((sum, c) => sum + Number(c.cut_amount), 0);

    return NextResponse.json({ services: withDetails, total: myTotal });
  }

  const { data: myCuts, error: cutsError } = await supabase
    .from("service_cuts")
    .select("service_id, cut_amount, paid")
    .eq("user_id", appUser.id);

  if (cutsError) return NextResponse.json({ error: cutsError.message }, { status: 500 });

  const serviceIds = (myCuts ?? []).map((c) => c.service_id);

  if (serviceIds.length === 0) {
    return NextResponse.json({ services: [], total: 0 });
  }

  const { data: services } = await supabase
    .from("services_sold")
    .select("*")
    .in("id", serviceIds);

  const { data: allCuts } = await supabase
    .from("service_cuts")
    .select("service_id, user_id, freelance_name, cut_percent, cut_amount, paid")
    .in("service_id", serviceIds);

  const cutsByService = new Map<string, BoosterCutOut[]>();
  for (const c of allCuts ?? []) {
    const list = cutsByService.get(c.service_id) ?? [];
    list.push({
      user_id: c.user_id,
      discord_username: c.user_id ? nameById.get(c.user_id) ?? "Desconocido" : c.freelance_name ?? "Freelance",
      is_freelance: !c.user_id,
      cut_percent: Number(c.cut_percent),
      cut_amount: Number(c.cut_amount),
      paid: c.paid,
    });
    cutsByService.set(c.service_id, list);
  }

  const myCutByService = new Map((myCuts ?? []).map((c) => [c.service_id, Number(c.cut_amount)]));

  const total = (myCuts ?? []).reduce((sum, c) => {
    if (c.paid) return sum;
    return sum + Number(c.cut_amount);
  }, 0);

  const result = (services ?? [])
    .map((s) => ({
      ...s,
      adv_username: s.adv_user_id ? nameById.get(s.adv_user_id) ?? "Desconocido" : null,
      boosters: cutsByService.get(s.id) ?? [],
      my_cut: myCutByService.get(s.id) ?? 0,
    }))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return NextResponse.json({ services: result, total });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const appRole = session.user.appRole;
  if (appRole !== "admin" && appRole !== "manager") {
    return NextResponse.json(
      { error: "Solo el líder o los managers pueden agregar runs" },
      { status: 403 }
    );
  }

  const discordId = session.user.discordId;
  const body = await req.json().catch(() => ({}));
  const { description, advUserId, pot, boosters: boostersRaw, currency, soldDate, advCutPercent } = body as {
    description?: string;
    advUserId?: string;
    pot?: number;
    boosters?: unknown;
    currency?: string;
    soldDate?: string;
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

  const { data: appUser } = await supabase
    .from("app_users")
    .select("id")
    .eq("discord_id", discordId)
    .single();

  if (!appUser) {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  }

  const { data: service, error: serviceError } = await supabase
    .from("services_sold")
    .insert({
      description,
      total_price: pot,
      currency: currency || "USD",
      sold_date: soldDate || new Date().toISOString().slice(0, 10),
      adv_user_id: advUserId || null,
      adv_cut_percent: cutPercent,
      created_by: appUser.id,
    })
    .select()
    .single();

  if (serviceError) return NextResponse.json({ error: serviceError.message }, { status: 500 });

  const freelanceNames = parsed.boosters.filter((b) => b.freelanceName).map((b) => b.freelanceName as string);
  const freelancerIdByName = await resolveFreelancerIdsByName(supabase, freelanceNames, appUser.id);

  const cutRows = computeCutRows(pot, advUserId || null, parsed.boosters, cutPercent).map((c) => ({
    service_id: service.id,
    ...c,
    freelancer_id: c.freelance_name ? (freelancerIdByName.get(c.freelance_name) ?? null) : null,
  }));

  const { error: cutsError } = await supabase.from("service_cuts").insert(cutRows);
  if (cutsError) return NextResponse.json({ error: cutsError.message }, { status: 500 });

  return NextResponse.json({ service });
}
