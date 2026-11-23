import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { revertObDiscount } from "@/lib/balance";
import { getCurrentAppUserId } from "@/lib/current-app-user";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const appRole = session.user.appRole;
  if (appRole !== "admin" && appRole !== "manager") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { id } = await params;
  const supabase = createServerSupabaseClient();
  const revertedBy = await getCurrentAppUserId(supabase, session.user);

  const result = await revertObDiscount(supabase, id, revertedBy);
  if (!result) {
    return NextResponse.json({ error: "Descuento no encontrado o ya reintegrado" }, { status: 404 });
  }

  return NextResponse.json({ success: true, ...result });
}
