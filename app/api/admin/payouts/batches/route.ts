import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getCurrentAppUserId } from "@/lib/current-app-user";
import { createPayoutBatch, listPayoutBatches } from "@/lib/payouts";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const appRole = session.user.appRole;
  if (appRole !== "admin" && appRole !== "manager") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const supabase = createServerSupabaseClient();

  try {
    const batches = await listPayoutBatches(supabase);
    return NextResponse.json({ batches });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error cargando el historial de lotes";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const appRole = session.user.appRole;
  if (appRole !== "admin" && appRole !== "manager") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { currency, note, items } = body as {
    currency?: string;
    note?: string | null;
    items?: Array<{ userId?: string | null; freelancerId?: string | null; serviceCutIds?: string[] }>;
  };

  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "El lote necesita al menos un booster incluido" }, { status: 400 });
  }
  for (const item of items) {
    if (
      (!item.userId && !item.freelancerId) ||
      !Array.isArray(item.serviceCutIds) ||
      item.serviceCutIds.length === 0
    ) {
      return NextResponse.json({ error: "Cada ítem necesita un booster y al menos una run pendiente" }, { status: 400 });
    }
  }

  const supabase = createServerSupabaseClient();
  const createdBy = await getCurrentAppUserId(supabase, session.user);

  try {
    const batch = await createPayoutBatch(
      supabase,
      {
        currency: currency?.trim() || "USDT",
        note: note?.trim() || null,
        items: items.map((i) => ({
          userId: i.userId ?? null,
          freelancerId: i.freelancerId ?? null,
          serviceCutIds: i.serviceCutIds as string[],
        })),
      },
      createdBy
    );
    return NextResponse.json({ batch });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error armando el lote de pago";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
