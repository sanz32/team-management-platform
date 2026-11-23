import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { attachEvidence, EVIDENCE_BUCKET, PointValidationError, updatePoint, type PointScope } from "@/lib/points";
import { resolveWclLink, WclNotFoundError, WclRateLimitError, WclReauthRequiredError } from "@/lib/wcl";

function isManager(appRole: string | undefined): boolean {
  return appRole === "admin" || appRole === "manager";
}

const EXTENSION_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const MAX_EVIDENCE_BYTES = 5 * 1024 * 1024;

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const appRole = session.user.appRole;
  if (!isManager(appRole)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { id } = await params;
  const supabase = createServerSupabaseClient();

  try {
    const form = await req.formData();
    const scope = String(form.get("scope") ?? "") as PointScope;
    const points = Number(form.get("points") ?? 1);
    const percent = Number(form.get("percent") ?? 10);
    const reasonRaw = String(form.get("reason") ?? "").trim();
    const wclUrl = String(form.get("wclUrl") ?? "").trim();

    let wclReportCode: string | null = null;
    let wclFightId: number | null = null;
    let wclBossName: string | null = null;
    let wclKill: boolean | null = null;
    let wclStartTime: string | null = null;

    if (scope === "run" && !wclUrl) {
      return NextResponse.json(
        { error: "Pega el link del pull o del reporte de Warcraft Logs." },
        { status: 400 }
      );
    }
    if (wclUrl) {
      const resolved = await resolveWclLink(supabase, wclUrl);
      wclReportCode = resolved.reportCode;
      if (resolved.kind === "fight") {
        wclFightId = resolved.fightId;
        wclBossName = resolved.bossName;
        wclKill = resolved.kill;
        wclStartTime = new Date(resolved.startTime).toISOString();
      } else if (resolved.startTime !== null) {
        wclStartTime = new Date(resolved.startTime).toISOString();
      }
    }

    const updated = await updatePoint(supabase, id, {
      scope,
      points,
      percent,
      reason: reasonRaw || null,
      wclReportCode,
      wclFightId,
      wclBossName,
      wclKill,
      wclStartTime,
    });

    const evidence = form.get("evidence");
    const evidenceIsValid = evidence instanceof File && evidence.size > 0;
    let evidenceWarning: string | null = null;

    if (evidenceIsValid) {
      const extension = EXTENSION_BY_TYPE[(evidence as File).type];
      if (!extension) {
        evidenceWarning = "El punto se guardó, pero la captura no es una imagen PNG, JPG o WebP.";
      } else if ((evidence as File).size > MAX_EVIDENCE_BYTES) {
        evidenceWarning = "El punto se guardó, pero la captura pesa más de 5 MB.";
      } else {
        const buffer = Buffer.from(await (evidence as File).arrayBuffer());
        const path = `${updated.userId}/${updated.id}.${extension}`;
        const { error: uploadError } = await supabase.storage
          .from(EVIDENCE_BUCKET)
          .upload(path, buffer, { contentType: (evidence as File).type, upsert: true });

        if (uploadError) {
          console.error("Error subiendo la captura editada de un punto:", uploadError.message);
          evidenceWarning = "El punto se guardó, pero la captura no se pudo subir.";
        } else {
          await attachEvidence(supabase, updated.id, path);
        }
      }
    }

    return NextResponse.json({ point: updated, evidenceWarning });
  } catch (err) {
    if (err instanceof PointValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    if (err instanceof WclNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    if (err instanceof WclRateLimitError) {
      return NextResponse.json({ error: err.message }, { status: 429 });
    }
    if (err instanceof WclReauthRequiredError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    const message = err instanceof Error ? err.message : "No se pudo editar el punto";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
