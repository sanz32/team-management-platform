import { NextRequest, NextResponse } from "next/server";
import { getListedSlots } from "@/lib/boost-store";
import { isBoostCategory } from "@/lib/boost";

export async function GET(req: NextRequest) {
  try {
    const difficulty = req.nextUrl.searchParams.get("difficulty");
    const slots = await getListedSlots(isBoostCategory(difficulty) ? difficulty : undefined);
    return NextResponse.json({
      slots: slots.map((s) => ({
        id: s.id,
        scheduledAt: s.scheduledAt,
        difficulty: s.difficulty,
        contents: s.contents,
        spotsLeft: s.spotsLeft,
        bookedCount: s.bookedCount,
        capacity: s.capacity,
      })),
    });
  } catch (err) {
    console.error("Error cargando los horarios de boosts:", err);
    return NextResponse.json({ error: "No se pudieron cargar los horarios" }, { status: 500 });
  }
}
