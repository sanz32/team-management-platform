import { NextResponse } from "next/server";
import { fetchRealmIndex } from "@/lib/blizzard";
import { BOOST_REGION } from "@/lib/boost";

export async function GET() {
  try {
    const realms = await fetchRealmIndex(BOOST_REGION);
    return NextResponse.json({ realms });
  } catch (err) {
    console.error("Error consultando el índice de reinos:", err);
    return NextResponse.json({ realms: [] });
  }
}
