"use client";

import { useEffect, useState } from "react";
import { Inbox, Send, Users } from "lucide-react";
import { formatDayLabel } from "@/lib/format";
import { cascadeStyle } from "@/lib/cascade";
import SwapRequestModal from "./SwapRequestModal";
import SwapExchangeCard, { SwapRequestDTO } from "./SwapExchangeCard";

interface DayOffEntry {
  id: string;
  date: string;
  lockedBySwap?: boolean;
}

interface DateCandidateGroup {
  date: string;
  entries: { userId: string; name: string; availabilityId: string }[];
}

interface TargetSelection {
  userId: string;
  name: string;
  availabilityId: string;
  date: string;
}

function sortRequests(list: SwapRequestDTO[]): SwapRequestDTO[] {
  const open = (s: SwapRequestDTO["status"]) => s === "pending" || s === "awaiting_rl";
  return [...list].sort((a, b) => {
    if (open(a.status) && !open(b.status)) return -1;
    if (!open(a.status) && open(b.status)) return 1;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

function RequestList({
  requests,
  viewerId,
  busyId,
  onAccept,
  onReject,
  onCancel,
  emptyIcon: EmptyIcon,
  emptyMessage,
  twoColumns,
}: {
  requests: SwapRequestDTO[];
  viewerId: string | null;
  busyId: string | null;
  onAccept?: (id: string) => void;
  onReject?: (id: string) => void;
  onCancel?: (id: string) => void;
  emptyIcon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  emptyMessage: string;
  twoColumns?: boolean;
}) {
  if (requests.length === 0) {
    return (
      <div className="card px-5 py-10 text-center">
        <EmptyIcon className="w-7 h-7 mx-auto mb-2.5" style={{ color: "var(--color-ink-faint)" }} />
        <p className="text-ink-faint text-sm">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className={twoColumns ? "grid grid-cols-1 xl:grid-cols-2 gap-3 items-start" : "space-y-3"}>
      {sortRequests(requests).map((r, index) => (
        <div key={r.id} className="cascade-item" style={cascadeStyle(index)}>
          <SwapExchangeCard
            request={r}
            viewerId={viewerId ?? undefined}
            busy={busyId === r.id}
            onAccept={onAccept ? () => onAccept(r.id) : undefined}
            onReject={onReject ? () => onReject(r.id) : undefined}
            onCancel={onCancel ? () => onCancel(r.id) : undefined}
          />
        </div>
      ))}
    </div>
  );
}

export default function IntercambiosView({
  myDaysOff,
  viewerId,
  offerId,
  onOfferIdChange,
  sent,
  received,
  busyId,
  error,
  onCreate,
  onAccept,
  onReject,
  onCancel,
}: {
  myDaysOff: DayOffEntry[];
  viewerId: string | null;
  offerId: string | null;
  onOfferIdChange: (id: string | null) => void;
  sent: SwapRequestDTO[];
  received: SwapRequestDTO[];
  busyId: string | null;
  error?: string;
  onCreate: (myAvailabilityId: string, theirAvailabilityId: string, message: string) => Promise<string | null>;
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  onCancel: (id: string) => void;
}) {
  const [candidates, setCandidates] = useState<DateCandidateGroup[] | null>(null);
  const [target, setTarget] = useState<TargetSelection | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [createError, setCreateError] = useState("");

  useEffect(() => {
    if (candidates !== null) return;
    fetch("/api/days-off/swap-candidates")
      .then((res) => res.json())
      .then((data) => setCandidates(data.groups ?? []));
  }, [candidates]);

  const offerable = myDaysOff.filter((d) => !d.lockedBySwap);
  const lockedCount = myDaysOff.length - offerable.length;

  const effectiveOfferId = offerId ?? (offerable.length === 1 ? offerable[0].id : null);
  const offeredDay = offerable.find((d) => d.id === effectiveOfferId) ?? null;
  const loadingCandidates = candidates === null;

  async function handleConfirm(message: string) {
    if (!offeredDay || !target) return;
    setSubmitting(true);
    setCreateError("");
    try {
      const failure = await onCreate(offeredDay.id, target.availabilityId, message);
      if (failure) {
        setCreateError(failure);
        return;
      }
      setTarget(null);
    } finally {
      setSubmitting(false);
    }
  }

  const pendingReceived = received.filter((r) => r.status === "pending").length;

  return (
    <div className="space-y-6">
      {(error || createError) && (
        <div
          className="text-sm rounded-xl p-3"
          style={{
            backgroundColor: "color-mix(in srgb, var(--color-danger) 12%, transparent)",
            border: "1px solid color-mix(in srgb, var(--color-danger) 35%, transparent)",
            color: "var(--color-danger)",
          }}
        >
          {error || createError}
        </div>
      )}

      <section>
        <div className="flex items-center gap-2 mb-3">
          <h2 className="font-heading text-base font-bold text-ink">Te propusieron</h2>
          {pendingReceived > 0 && <span className="pill pill-warning">{pendingReceived} sin responder</span>}
        </div>
        <RequestList
          requests={received}
          viewerId={viewerId}
          busyId={busyId}
          onAccept={onAccept}
          onReject={onReject}
          emptyIcon={Inbox}
          emptyMessage="Nadie te propuso un intercambio."
          twoColumns
        />
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section>
          <h2 className="font-heading text-base font-bold text-ink mb-1">Proponer un intercambio</h2>
          <p className="text-ink-muted text-sm mb-3">
            Elige qué día cedes y con quién lo cambias.
          </p>

          <div className="card p-4">
            {myDaysOff.length === 0 ? (
              <p className="text-ink-faint text-sm">
                Todavía no tienes días libres programados. Un RL te los asigna desde la vista del
                guild.
              </p>
            ) : offerable.length === 0 ? (
              <p className="text-ink-faint text-sm">
                {lockedCount === 1
                  ? "Tu único día libre ya está en un intercambio en curso. Espera a que se resuelva para proponer otro."
                  : "Todos tus días libres ya están en intercambios en curso. Espera a que se resuelvan para proponer otro."}
              </p>
            ) : (
              <>
                {offerable.length > 1 && (
                  <div className="mb-4">
                    <label className="block text-xs text-ink-muted mb-1.5 font-medium">
                      Cedes tu día del
                    </label>
                    <select
                      value={effectiveOfferId ?? ""}
                      onChange={(e) => onOfferIdChange(e.target.value || null)}
                      className="input px-3 py-2 text-sm w-full"
                    >
                      <option value="" disabled>
                        Elige una fecha...
                      </option>
                      {offerable.map((d) => (
                        <option key={d.id} value={d.id}>
                          {formatDayLabel(d.date)}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {offerable.length === 1 && (
                  <p className="text-xs text-ink-muted mb-4">
                    Cedes tu día del{" "}
                    <span className="font-data font-semibold text-ink">
                      {formatDayLabel(offerable[0].date)}
                    </span>
                  </p>
                )}

                {lockedCount > 0 && (
                  <p className="text-ink-faint text-label mb-4 -mt-2">
                    {lockedCount === 1
                      ? "Otro de tus días ya está en un intercambio en curso."
                      : `Otros ${lockedCount} días tuyos ya están en intercambios en curso.`}
                  </p>
                )}

                <p className="text-caption !text-ink-faint mb-2.5">A cambio del día de</p>

                {!effectiveOfferId ? (
                  <p className="text-ink-faint text-sm">Elige primero cuál de tus días cedes.</p>
                ) : loadingCandidates ? (
                  <p className="text-ink-faint text-sm">Cargando...</p>
                ) : !candidates || candidates.length === 0 ? (
                  <div className="text-center py-6">
                    <Users className="w-7 h-7 mx-auto mb-2.5" style={{ color: "var(--color-ink-faint)" }} />
                    <p className="text-ink-faint text-sm">
                      Nadie más tiene un día libre futuro programado.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3.5 max-h-[420px] overflow-y-auto pr-1">
                    {candidates.map((g) => (
                      <div key={g.date}>
                        <p className="font-data text-xs font-semibold text-ink mb-1.5">
                          {formatDayLabel(g.date)}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {g.entries.map((e) => (
                            <button
                              key={e.availabilityId}
                              type="button"
                              onClick={() =>
                                setTarget({
                                  userId: e.userId,
                                  name: e.name,
                                  availabilityId: e.availabilityId,
                                  date: g.date,
                                })
                              }
                              className="btn btn-secondary !py-1.5 !px-3 text-xs"
                            >
                              {e.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </section>

        <section>
          <h2 className="font-heading text-base font-bold text-ink mb-1">Lo que enviaste</h2>
          <p className="text-ink-muted text-sm mb-3">Cómo va cada solicitud que propusiste.</p>
          <RequestList
            requests={sent}
            viewerId={viewerId}
            busyId={busyId}
            onCancel={onCancel}
            emptyIcon={Send}
            emptyMessage="No propusiste ningún intercambio."
          />
        </section>
      </div>

      {target && offeredDay && (
        <SwapRequestModal
          myDate={offeredDay.date}
          theirName={target.name}
          theirDate={target.date}
          submitting={submitting}
          onConfirm={handleConfirm}
          onCancel={() => setTarget(null)}
        />
      )}
    </div>
  );
}
