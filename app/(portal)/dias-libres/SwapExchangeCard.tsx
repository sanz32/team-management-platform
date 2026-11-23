"use client";

import { useState } from "react";
import { ArrowLeftRight, Check, ChevronDown, Trash2, X } from "lucide-react";

export type SwapStatus =
  | "pending"
  | "awaiting_rl"
  | "accepted"
  | "rejected"
  | "denied"
  | "cancelled"
  | "expired";

export interface SwapRequestDTO {
  id: string;
  status: SwapStatus;
  message: string | null;
  requesterId: string;
  requesterName: string;
  requesterDate: string;
  recipientId: string;
  recipientName: string;
  recipientDate: string;
  createdAt: string;
  respondedAt: string | null;
  reviewedAt: string | null;
  reviewedByName: string | null;
}

const FULL_DATE = new Intl.DateTimeFormat("es-ES", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

function fullDate(dateStr: string): string {
  const label = FULL_DATE.format(new Date(`${dateStr}T00:00:00Z`));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

const STATUS_PILL: Record<SwapStatus, { label: string; className: string } | null> = {
  pending: null,
  awaiting_rl: null,
  accepted: { label: "Aprobado", className: "pill-success" },
  denied: { label: "RL no aprobó", className: "pill-common" },
  rejected: { label: "Rechazado", className: "pill-common" },
  cancelled: { label: "Retirado", className: "pill-common" },
  expired: { label: "Vencido", className: "pill-common" },
};

type GateState = "done" | "current" | "failed" | "inert";

interface Gate {
  label: string;
  state: GateState;
}

const GATE_COLOR: Record<GateState, string> = {
  done: "var(--color-success)",
  current: "var(--color-warning)",
  failed: "var(--color-danger)",
  inert: "var(--color-ink-faint)",
};

function buildGates(request: SwapRequestDTO): Gate[] {
  const { status, recipientName } = request;

  const proposal: Gate = {
    label: "Propuesta",
    state: status === "cancelled" ? "failed" : "done",
  };

  const partner: Gate =
    status === "pending"
      ? { label: `Espera a ${recipientName}`, state: "current" }
      : status === "rejected"
        ? { label: `${recipientName} dijo que no`, state: "failed" }
        : status === "cancelled" || status === "expired"
          ? { label: "Aceptado", state: "inert" }
          : { label: "Aceptado", state: "done" };

  const review: Gate =
    status === "awaiting_rl"
      ? { label: "Espera al RL", state: "current" }
      : status === "accepted"
        ? { label: "Aprobado", state: "done" }
        : status === "denied"
          ? { label: "RL no aprobó", state: "failed" }
          : { label: "Aprobación", state: "inert" };

  return [proposal, partner, review];
}

function StageTrack({ request }: { request: SwapRequestDTO }) {
  const gates = buildGates(request);

  return (
    <div className="flex items-start">
      {gates.map((gate, i) => {
        const color = GATE_COLOR[gate.state];
        const filled = gate.state !== "inert";
        return (
          <div key={gate.label} className="flex-1 min-w-0 flex flex-col items-center">
            <div className="flex items-center w-full">
              <span
                className="h-px flex-1"
                style={{ backgroundColor: i === 0 ? "transparent" : "var(--color-line-strong)" }}
              />
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0 mx-1"
                style={{
                  backgroundColor: filled ? color : "transparent",
                  border: `1.5px solid ${color}`,
                  boxShadow:
                    gate.state === "current"
                      ? `0 0 0 3px color-mix(in srgb, ${color} 22%, transparent)`
                      : undefined,
                }}
              />
              <span
                className="h-px flex-1"
                style={{
                  backgroundColor: i === gates.length - 1 ? "transparent" : "var(--color-line-strong)",
                }}
              />
            </div>
            <span
              className="text-micro leading-tight mt-1.5 text-center px-1"
              style={{
                color: gate.state === "inert" ? "var(--color-ink-faint)" : color,
                fontWeight: gate.state === "current" ? 700 : 500,
              }}
            >
              {gate.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function SwapSide({
  name,
  date,
  isViewer,
  align,
}: {
  name: string;
  date: string;
  isViewer: boolean;
  align: "left" | "right";
}) {
  return (
    <div className={`min-w-0 ${align === "right" ? "text-right" : "text-left"}`}>
      <p className="text-sm font-semibold text-ink truncate">
        {name}
        {isViewer && <span className="text-ink-faint font-normal text-xs"> · tú</span>}
      </p>
      <p className="font-data text-sm font-semibold text-ink">{fullDate(date)}</p>
    </div>
  );
}

export default function SwapExchangeCard({
  request,
  viewerId,
  onAccept,
  onReject,
  onCancel,
  onDelete,
  busy,
  accent,
  collapsible,
  children,
}: {
  request: SwapRequestDTO;
  viewerId?: string;
  onAccept?: () => void;
  onReject?: () => void;
  onCancel?: () => void;
  onDelete?: () => void;
  busy?: boolean;
  accent?: boolean;
  collapsible?: boolean;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const expanded = !collapsible || open;
  const canRespond = request.status === "pending";
  const showActions = canRespond && (onAccept || onReject || onCancel);
  const pill = STATUS_PILL[request.status];

  const exchange = (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 flex-1 min-w-0">
      <SwapSide
        name={request.requesterName}
        date={request.requesterDate}
        isViewer={viewerId === request.requesterId}
        align="left"
      />
      <ArrowLeftRight className="w-4 h-4 shrink-0" style={{ color: "var(--color-primary)" }} />
      <SwapSide
        name={request.recipientName}
        date={request.recipientDate}
        isViewer={viewerId === request.recipientId}
        align="right"
      />
    </div>
  );

  return (
    <article
      className="card p-4"
      style={accent ? { borderLeft: "3px solid var(--color-primary)" } : undefined}
    >
      <div className={`flex items-center gap-3 ${expanded ? "mb-3" : ""}`}>
        {collapsible ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="flex items-center gap-3 flex-1 min-w-0 text-left"
          >
            {exchange}
            <ChevronDown
              className="w-4 h-4 shrink-0 text-ink-faint transition-transform"
              style={{ transform: open ? "rotate(180deg)" : undefined }}
            />
          </button>
        ) : (
          exchange
        )}
        {!expanded && pill && <span className={`pill ${pill.className} shrink-0`}>{pill.label}</span>}
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            disabled={busy}
            title="Eliminar del historial"
            className="text-ink-faint hover:text-[color:var(--color-danger)] p-1 transition-colors shrink-0"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {expanded && (
        <>
          {request.message && (
            <p className="text-ink-muted text-xs italic mb-3 line-clamp-2">
              &ldquo;{request.message}&rdquo;
            </p>
          )}

          <StageTrack request={request} />

          {children}

          {showActions && (
            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-line">
              {onAccept && (
                <button
                  type="button"
                  onClick={onAccept}
                  disabled={busy}
                  className="btn btn-primary !py-1.5 !px-3 text-xs inline-flex items-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5" />
                  Aceptar
                </button>
              )}
              {onReject && (
                <button
                  type="button"
                  onClick={onReject}
                  disabled={busy}
                  className="btn btn-danger !py-1.5 !px-3 text-xs inline-flex items-center gap-1.5"
                >
                  <X className="w-3.5 h-3.5" />
                  Rechazar
                </button>
              )}
              {onCancel && (
                <button
                  type="button"
                  onClick={onCancel}
                  disabled={busy}
                  className="btn btn-ghost !py-1.5 !px-3 text-xs"
                >
                  Retirar solicitud
                </button>
              )}
            </div>
          )}

          {request.reviewedByName && (
            <p className="text-micro text-ink-faint mt-2.5">
              {request.status === "accepted" ? "Aprobado" : "Revisado"} por {request.reviewedByName}
            </p>
          )}
        </>
      )}
    </article>
  );
}
