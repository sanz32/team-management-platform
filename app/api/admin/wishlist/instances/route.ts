import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { fetchJournalInstanceIndex } from "@/lib/blizzard-journal";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  if (session.user.appRole !== "admin" && session.user.appRole !== "manager") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  try {
    const region = process.env.BLIZZARD_REGION || "us";
    const instances = await fetchJournalInstanceIndex(region);
    return NextResponse.json({ instances });
  } catch (err) {
    console.error("Error consultando instancias del Journal de Blizzard:", err);
    return NextResponse.json(
      { error: "No se pudo consultar el catálogo de raids de Blizzard." },
      { status: 500 }
    );
  }
}
