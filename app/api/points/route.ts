import { after } from "next/server";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getCurrentAppUserId } from "@/lib/current-app-user";
import {
  attachEvidence,
  createPoint,
  EVIDENCE_BUCKET,
  getCurrentPointsWeek,
  getDiscordIdsByUserId,
  getGuildPointsWeekSnapshot,
  getPointEligibleMembers,
  getUserPointsHistory,
  PointValidationError,
  type GuildPointRow,
  type PointScope,
} from "@/lib/points";
import { cleanupStaleEvidenceIfDue } from "@/lib/points-evidence-cleanup";
import { notifyPointAssigned } from "@/lib/notifications";
import { announcePointAssigned } from "@/lib/discord-points";
import { resolveWclLink, WclNotFoundError, WclRateLimitError, WclReauthRequiredError } from "@/lib/wcl";

function isBlockedRole(appRole: string | undefined): boolean {
  return appRole === "guest" || appRole === "friend";
}

function isManager(appRole: string | undefined): boolean {
  return appRole === "admin" || appRole === "manager";
}

const EXTENSION_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const MAX_EVIDENCE_BYTES = 5 * 1024 * 1024;

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const appRole = session.user.appRole;
  if (isBlockedRole(appRole)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const supabase = createServerSupabaseClient();

  after(() => cleanupStaleEvidenceIfDue(supabase));

  const all = req.nextUrl.searchParams.get("all") === "true";
  const requestedUserId = req.nextUrl.searchParams.get("userId");

  if (all) {
    const manager = isManager(appRole);
    const requestedWeek = req.nextUrl.searchParams.get("weekStart");
    const weekStart = manager && requestedWeek ? requestedWeek : getCurrentPointsWeek();

    const [snapshot, members] = await Promise.all([
      getGuildPointsWeekSnapshot(supabase, weekStart),
      getPointEligibleMembers(supabase),
    ]);

    const rows = manager ? snapshot.rows : snapshot.rows.map((r) => ({ ...r, reason: null }));

    return NextResponse.json({
      weekStart: snapshot.weekStart,
      currentWeek: getCurrentPointsWeek(),
      rows,
      totalsByUser: snapshot.totalsByUser,
      members,
    });
  }

  const appUserId = await getCurrentAppUserId(supabase, session.user);
  const targetUserId = requestedUserId ?? appUserId;

  if (!targetUserId) {
    return NextResponse.json({ weeks: [], currentWeek: getCurrentPointsWeek() });
  }
  if (targetUserId !== appUserId && !isManager(appRole)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const allWeeks = await getUserPointsHistory(supabase, targetUserId);
  const currentWeek = getCurrentPointsWeek();
  const weeks = isManager(appRole) ? allWeeks : allWeeks.filter((w) => w.weekStart <= currentWeek);
  return NextResponse.json({ weeks, currentWeek, userId: targetUserId });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const appRole = session.user.appRole;
  if (!isManager(appRole)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const supabase = createServerSupabaseClient();

  try {
    const form = await req.formData();
    const userIds = Array.from(new Set(form.getAll("userId").map((v) => String(v).trim()).filter(Boolean)));
    const scope = String(form.get("scope") ?? "") as PointScope;
    const points = Number(form.get("points") ?? 1);
    const percent = Number(form.get("percent") ?? 10);
    const reasonRaw = String(form.get("reason") ?? "").trim();
    const wclUrl = String(form.get("wclUrl") ?? "").trim();
    const weekStartRaw = String(form.get("weekStart") ?? "").trim();

    if (userIds.length === 0) {
      return NextResponse.json({ error: "Elige a quién se le carga el punto." }, { status: 400 });
    }

    const [eligible, discordIdByUserId] = await Promise.all([
      getPointEligibleMembers(supabase),
      getDiscordIdsByUserId(supabase, userIds),
    ]);
    const eligibleIds = new Set(eligible.map((m) => m.id));
    const ineligible = userIds.filter((id) => !eligibleIds.has(id));
    if (ineligible.length > 0) {
      return NextResponse.json(
        { error: "Uno o más miembros elegidos no pueden recibir puntos." },
        { status: 400 }
      );
    }

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

    const createdBy = await getCurrentAppUserId(supabase, session.user);
    const evidence = form.get("evidence");
    const evidenceIsValid = evidence instanceof File && evidence.size > 0;
    const evidenceExtension = evidenceIsValid ? EXTENSION_BY_TYPE[(evidence as File).type] : undefined;
    const evidenceBuffer =
      evidenceIsValid && evidenceExtension ? Buffer.from(await (evidence as File).arrayBuffer()) : null;

    const plural = userIds.length > 1;
    let evidenceWarning: string | null = null;
    if (evidenceIsValid && !evidenceExtension) {
      evidenceWarning = plural
        ? "Los puntos se guardaron, pero la captura no es una imagen PNG, JPG o WebP."
        : "El punto se guardó, pero la captura no es una imagen PNG, JPG o WebP.";
    } else if (evidenceIsValid && (evidence as File).size > MAX_EVIDENCE_BYTES) {
      evidenceWarning = plural
        ? "Los puntos se guardaron, pero la captura pesa más de 5 MB."
        : "El punto se guardó, pero la captura pesa más de 5 MB.";
    }

    const createdPoints: GuildPointRow[] = [];
    let uploadFailures = 0;

    for (const userId of userIds) {
      const point = await createPoint(supabase, {
        userId,
        createdBy,
        scope,
        points,
        percent,
        reason: reasonRaw || null,
        wclReportCode,
        wclFightId,
        wclBossName,
        wclKill,
        wclStartTime,
        weekStart: weekStartRaw || undefined,
      });
      createdPoints.push(point);

      if (evidenceBuffer) {
        const path = `${userId}/${point.id}.${evidenceExtension}`;
        const { error: uploadError } = await supabase.storage
          .from(EVIDENCE_BUCKET)
          .upload(path, evidenceBuffer, { contentType: (evidence as File).type, upsert: true });

        if (uploadError) {
          console.error("Error subiendo la captura de un punto:", uploadError.message);
          uploadFailures += 1;
        } else {
          await attachEvidence(supabase, point.id, path);
        }
      }

      notifyPointAssigned(
        {
          userId,
          points: point.points,
          scope: point.scope,
          reason: point.reason,
          bossName: point.wclBossName,
          kill: point.wclKill,
          weekStart: point.weekStart,
        },
        supabase
      ).catch(() => {});

      announcePointAssigned({
        memberDiscordId: discordIdByUserId.get(userId) ?? null,
        points: point.points,
        scope: point.scope,
        reason: point.reason,
        bossName: point.wclBossName,
        kill: point.wclKill,
        weekStart: point.weekStart,
      }).catch(() => {});
    }

    if (uploadFailures > 0) {
      evidenceWarning =
        uploadFailures === createdPoints.length
          ? plural
            ? "Los puntos se guardaron, pero la captura no se pudo subir."
            : "El punto se guardó, pero la captura no se pudo subir."
          : `Los puntos se guardaron, pero la captura no se pudo subir para ${uploadFailures} de ${createdPoints.length}.`;
    }

    return NextResponse.json({ point: createdPoints[0], points: createdPoints, evidenceWarning });
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
    const message = err instanceof Error ? err.message : "No se pudo guardar el punto";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
