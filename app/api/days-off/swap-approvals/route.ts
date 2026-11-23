import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { formatSwapRequest, getLockoutSummariesForUsers, resolveUserNames } from "@/lib/day-off-swaps";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const appRole = session.user.appRole;
  if (appRole !== "admin" && appRole !== "manager") {
    return NextResponse.json(
      { error: "Solo el líder o los RL pueden ver las aprobaciones" },
      { status: 403 }
    );
  }

  const supabase = createServerSupabaseClient();

  const { data: rows, error } = await supabase
    .from("day_off_swap_requests")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const all = rows ?? [];
  const awaiting = all.filter((r) => r.status === "awaiting_rl");
  const resolved = all.filter((r) => r.status !== "awaiting_rl" && r.status !== "pending");

  const nameById = await resolveUserNames(
    supabase,
    all.flatMap((r) => [r.requester_id, r.recipient_id, r.reviewed_by].filter(Boolean) as string[])
  );

  const lockouts = await getLockoutSummariesForUsers(
    supabase,
    awaiting.flatMap((r) => [r.requester_id, r.recipient_id])
  );

  return NextResponse.json({
    awaiting: awaiting.map((r) => formatSwapRequest(r, nameById)),
    resolved: resolved.map((r) => formatSwapRequest(r, nameById)),
    lockouts: Object.fromEntries(lockouts),
  });
}
