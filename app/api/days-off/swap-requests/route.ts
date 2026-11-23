import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  checkSwapConflict,
  formatSwapRequest,
  getLockedAvailabilityIds,
  resolveUserNames,
} from "@/lib/day-off-swaps";
import { notifySwapRequest } from "@/lib/notifications";
import { getCurrentAppUserId } from "@/lib/current-app-user";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const appRole = session.user.appRole;
  const wantsAll = req.nextUrl.searchParams.get("all") === "true";

  const supabase = createServerSupabaseClient();

  if (wantsAll) {
    if (appRole !== "admin" && appRole !== "manager") {
      return NextResponse.json(
        { error: "Solo el líder o los managers pueden ver todos los intercambios" },
        { status: 403 }
      );
    }

    const { data: rows, error } = await supabase
      .from("day_off_swap_requests")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const nameById = await resolveUserNames(
      supabase,
      (rows ?? []).flatMap((r) => [r.requester_id, r.recipient_id, r.reviewed_by].filter(Boolean) as string[])
    );

    return NextResponse.json({ requests: (rows ?? []).map((r) => formatSwapRequest(r, nameById)) });
  }

  const appUserId = await getCurrentAppUserId(supabase, session.user);
  if (!appUserId) {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  }

  const isApprover = appRole === "admin" || appRole === "manager";
  const [{ data: rows, error }, approvalCountResult] = await Promise.all([
    supabase
      .from("day_off_swap_requests")
      .select("*")
      .or(`requester_id.eq.${appUserId},recipient_id.eq.${appUserId}`)
      .order("created_at", { ascending: false }),
    isApprover
      ? supabase.from("day_off_swap_requests").select("id", { count: "exact", head: true }).eq("status", "awaiting_rl")
      : Promise.resolve({ count: 0, error: null }),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (approvalCountResult.error) {
    console.error("Error contando intercambios por aprobar:", approvalCountResult.error.message);
  }
  const awaitingApprovalCount = approvalCountResult.count ?? 0;

  const nameById = await resolveUserNames(
    supabase,
    (rows ?? []).flatMap((r) => [r.requester_id, r.recipient_id])
  );

  const formatted = (rows ?? []).map((r) => formatSwapRequest(r, nameById));
  const sent = formatted.filter((r) => r.requesterId === appUserId);
  const received = formatted.filter((r) => r.recipientId === appUserId);

  return NextResponse.json({ sent, received, awaitingApprovalCount });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const supabase = createServerSupabaseClient();

  const { data: appUser } = await supabase
    .from("app_users")
    .select("id")
    .eq("discord_id", session.user.discordId)
    .maybeSingle();

  if (!appUser) {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const { myAvailabilityId, theirAvailabilityId, message } = body as {
    myAvailabilityId?: string;
    theirAvailabilityId?: string;
    message?: string;
  };

  if (!myAvailabilityId || !theirAvailabilityId) {
    return NextResponse.json({ error: "Faltan las 2 fechas a intercambiar" }, { status: 400 });
  }

  const { data: rows, error: rowsError } = await supabase
    .from("availability")
    .select("id, user_id, date")
    .in("id", [myAvailabilityId, theirAvailabilityId]);
  if (rowsError) return NextResponse.json({ error: rowsError.message }, { status: 500 });

  const myRow = (rows ?? []).find((r) => r.id === myAvailabilityId);
  const theirRow = (rows ?? []).find((r) => r.id === theirAvailabilityId);

  if (!myRow || myRow.user_id !== appUser.id) {
    return NextResponse.json({ error: "Ese día libre no te pertenece" }, { status: 403 });
  }
  if (!theirRow || theirRow.user_id === appUser.id) {
    return NextResponse.json({ error: "Elige el día libre de otro usuario" }, { status: 400 });
  }

  const locked = await getLockedAvailabilityIds(supabase);
  if (locked.has(myAvailabilityId)) {
    return NextResponse.json(
      { error: "Ese día tuyo ya está en un intercambio en curso. Resuélvelo antes de proponer otro." },
      { status: 409 }
    );
  }
  if (locked.has(theirAvailabilityId)) {
    return NextResponse.json(
      { error: "Ese día ya está en un intercambio en curso con otra persona." },
      { status: 409 }
    );
  }

  const [alreadyHaveirDate, theyAlreadyHaveMyDate] = await Promise.all([
    checkSwapConflict(supabase, appUser.id, theirRow.date, myAvailabilityId),
    checkSwapConflict(supabase, theirRow.user_id, myRow.date, theirAvailabilityId),
  ]);
  if (alreadyHaveirDate || theyAlreadyHaveMyDate) {
    return NextResponse.json(
      { error: "Uno de los 2 ya tiene esa fecha como día libre, no se puede intercambiar" },
      { status: 409 }
    );
  }

  const { data: requester } = await supabase
    .from("app_users")
    .select("nickname, discord_username")
    .eq("id", appUser.id)
    .maybeSingle();
  const requesterName = requester?.nickname ?? requester?.discord_username ?? "Alguien";

  const { data: created, error: insertError } = await supabase
    .from("day_off_swap_requests")
    .insert({
      requester_id: appUser.id,
      recipient_id: theirRow.user_id,
      requester_availability_id: myAvailabilityId,
      recipient_availability_id: theirAvailabilityId,
      requester_date: myRow.date,
      recipient_date: theirRow.date,
      message: message?.trim() || null,
    })
    .select("*")
    .single();

  if (insertError) {
    if (insertError.code === "23505") {
      return NextResponse.json(
        { error: "Ya tienes una solicitud pendiente para este mismo intercambio" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  await notifySwapRequest({
    recipientId: theirRow.user_id,
    requesterName,
    requesterDate: myRow.date,
    recipientDate: theirRow.date,
  });

  const nameById = await resolveUserNames(supabase, [appUser.id, theirRow.user_id]);
  return NextResponse.json({ request: formatSwapRequest(created, nameById) });
}
