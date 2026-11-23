import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { fetchCharacterData } from "@/lib/blizzard";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { name, realm_slug, region } = body as {
    name?: string;
    realm_slug?: string;
    region?: string;
  };

  if (!name || !realm_slug) {
    return NextResponse.json({ error: "Nombre y reino son obligatorios" }, { status: 400 });
  }

  try {
    const data = await fetchCharacterData(region || "us", realm_slug, name);
    return NextResponse.json({ found: data.found, class: data.class, faction: data.faction });
  } catch (err) {
    console.error("Error consultando Blizzard en preview de personaje:", err);
    return NextResponse.json({ found: false, class: null, faction: null });
  }
}
