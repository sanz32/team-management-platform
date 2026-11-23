import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getCurrentAppUserId } from "@/lib/current-app-user";
import { canUseBoostLinks, ensureRaiderLink } from "@/lib/boost-links";
import { BOOKING_COLUMNS, toBooking } from "@/lib/boost-store";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const appRole = session.user.appRole;
    if (!canUseBoostLinks(appRole)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const supabase = createServerSupabaseClient();
    const appUserId = await getCurrentAppUserId(supabase, session.user);
    if (!appUserId) {
      return NextResponse.json(
        { error: "Tu usuario no está registrado todavía. Vuelve a iniciar sesión." },
        { status: 400 }
      );
    }

    const wantsAll = req.nextUrl.searchParams.get("all") === "true";
    const isAdmin = appRole === "admin";

    const displayName = session.user.nickname || session.user.name || "raider";
    const linkPromise = ensureRaiderLink(supabase, appUserId, displayName);

    let bookingsQuery = supabase
      .from("boost_bookings")
      .select(BOOKING_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(200);

    if (!(wantsAll && isAdmin)) {
      bookingsQuery = bookingsQuery.eq("raider_owner_id", appUserId);
    }

    const [link, bookingsRes] = await Promise.all([linkPromise, bookingsQuery]);

    if (bookingsRes.error) {
      return NextResponse.json({ error: bookingsRes.error.message }, { status: 500 });
    }

    return NextResponse.json({
      slug: link?.slug ?? null,
      teamName: link?.teamName ?? null,
      canSeeAll: isAdmin,
      viewingAll: wantsAll && isAdmin,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      bookings: (bookingsRes.data ?? []).map((row: any) => toBooking(row)),
    });
  } catch (err) {
    console.error("Error cargando las reservas:", err);
    return NextResponse.json({ error: "No se pudieron cargar las reservas" }, { status: 500 });
  }
}
