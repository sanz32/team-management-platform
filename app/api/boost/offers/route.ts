import { NextRequest, NextResponse } from "next/server";
import { getActiveOffers } from "@/lib/boost-store";
import { isBoostCategory } from "@/lib/boost";

export async function GET(req: NextRequest) {
  try {
    const category = req.nextUrl.searchParams.get("category");
    const offers = await getActiveOffers();
    const filtered = isBoostCategory(category) ? offers.filter((o) => o.category === category) : offers;
    return NextResponse.json({ offers: filtered });
  } catch (err) {
    console.error("Error cargando el catálogo de boosts:", err);
    return NextResponse.json({ error: "No se pudo cargar el catálogo" }, { status: 500 });
  }
}
