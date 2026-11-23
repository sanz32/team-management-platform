import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { listFreelancers } from "@/lib/freelancers";

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
    const freelancers = await listFreelancers(supabase);
    return NextResponse.json({ freelancers });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error cargando freelancers";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
