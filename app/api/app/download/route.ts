import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getAppDownloadUrl } from "@/lib/app-download";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const url = getAppDownloadUrl();
  if (!url) {
    return NextResponse.json(
      { error: "La descarga todavía no está publicada." },
      { status: 404 }
    );
  }

  return NextResponse.redirect(url);
}
