"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, Copy, ExternalLink, Ticket, Store, Swords, Trash2 } from "lucide-react";
import PageHeader from "@/app/components/PageHeader";
import LoadingState from "@/app/components/LoadingState";
import IconAction from "@/app/components/IconAction";
import { useToast } from "@/app/components/ToastProvider";
import { useConfirm } from "@/app/components/ConfirmDialogProvider";
import { readJsonBody } from "@/lib/read-json";
import { cascadeStyle } from "@/lib/cascade";
import { classColor } from "@/lib/wow-classes";
import { formatGold, type BoostStatus } from "@/lib/boost";

interface Booking {
  id: string;
  status: BoostStatus;
  statusToken: string;
  createdAt: string;
  source: "package" | "run";
  offerTitle: string;
  offerPriceGold: number | null;
  offerCategory: string;
  slotScheduledAt: string | null;
  characterName: string;
  characterRealm: string;
  characterRegion: string;
  characterClass: string | null;
  characterSpec: string | null;
  characterIlvl: number | null;
  buyerDiscordId: string;
  buyerDiscordUsername: string | null;
  buyerDiscordAvatarUrl: string | null;
  buyerNote: string | null;
  raiderOwnerId: string | null;
  raiderName: string | null;
}

const STATUS_LABEL: Record<BoostStatus, string> = {
  pending: "Pendiente",
  confirmed: "Confirmada",
  completed: "Completada",
  cancelled: "Cancelada",
};

const STATUS_PILL: Record<BoostStatus, string> = {
  pending: "pill pill-warning",
  confirmed: "pill pill-info",
  completed: "pill pill-success",
  cancelled: "pill pill-common",
};

const CATEGORY_LABEL: Record<string, string> = {
  normal: "Normal",
  heroic: "Heroico",
  mythic: "Mítico",
};

function formatWhen(iso: string | null): string {
  if (!iso) return "Horario a acordar";
  return new Date(iso).toLocaleString("es-CL", { dateStyle: "medium", timeStyle: "short" });
}

function BookingCard({
  booking,
  index,
  onChangeStatus,
  onDelete,
  busy,
  showOwner,
}: {
  booking: Booking;
  index: number;
  onChangeStatus: (booking: Booking, status: BoostStatus) => void;
  onDelete: (booking: Booking) => void;
  busy: boolean;
  showOwner: boolean;
}) {
  const color = classColor(booking.characterClass);

  return (
    <article
      className="card card-hover p-4 cascade-item"
      style={{ ...cascadeStyle(index), borderLeft: `3px solid ${color}` }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="section-eyebrow">
            {CATEGORY_LABEL[booking.offerCategory] ?? booking.offerCategory}
            <span className="pill pill-common ml-2">
              {booking.source === "run" ? "Run agendada" : "Paquete"}
            </span>
          </p>
          <h3 className="font-heading font-semibold text-ink mt-1">{booking.offerTitle}</h3>
          <p className="text-meta text-ink-muted mt-0.5">
            {formatWhen(booking.slotScheduledAt)} ·{" "}
            {booking.offerPriceGold == null
              ? "precio a acordar"
              : `${formatGold(booking.offerPriceGold, "es")} de oro`}
          </p>
        </div>
        <span className={STATUS_PILL[booking.status]}>{STATUS_LABEL[booking.status]}</span>
      </div>

      <div className="grid gap-3 mt-3.5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))" }}>
        <div className="balance-row rounded-lg px-3 py-2.5">
          <p className="text-label text-ink-faint">Comprador</p>
          <div className="flex items-center gap-2 mt-1.5">
            {booking.buyerDiscordAvatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={booking.buyerDiscordAvatarUrl} alt="" className="w-6 h-6 rounded-full shrink-0" />
            ) : (
              <span className="w-6 h-6 rounded-full shrink-0" style={{ backgroundColor: "var(--color-surface)" }} />
            )}
            <span className="text-sm text-ink truncate">{booking.buyerDiscordUsername ?? "Sin nombre"}</span>
          </div>
          <p className="text-micro text-ink-faint mt-1 font-data">ID {booking.buyerDiscordId}</p>
        </div>

        <div className="balance-row rounded-lg px-3 py-2.5">
          <p className="text-label text-ink-faint">Personaje</p>
          <p className="text-sm mt-1.5 truncate" style={{ color }}>
            {booking.characterName}
            <span className="text-ink-faint">-{booking.characterRealm}</span>
          </p>
          <p className="text-micro text-ink-faint mt-1">
            {[
              booking.characterRegion.toUpperCase(),
              booking.characterSpec ?? booking.characterClass,
              booking.characterIlvl ? `ilvl ${booking.characterIlvl}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>

        {showOwner && (
          <div className="balance-row rounded-lg px-3 py-2.5">
            <p className="text-label text-ink-faint">ADV</p>
            <p className="text-sm text-ink mt-1.5 truncate">{booking.raiderName ?? "Sin asignar"}</p>
          </div>
        )}
      </div>

      {booking.buyerNote && (
        <p className="text-meta text-ink-muted mt-3 whitespace-pre-line">
          <span className="text-ink-faint">Nota: </span>
          {booking.buyerNote}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 mt-3.5">
        <a
          href={`https://discord.com/users/${booking.buyerDiscordId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-secondary"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Abrir en Discord
        </a>
        {booking.status === "pending" && (
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => onChangeStatus(booking, "confirmed")}>
            Marcar confirmada
          </button>
        )}
        {booking.status === "confirmed" && (
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => onChangeStatus(booking, "completed")}>
            Marcar completada
          </button>
        )}
        {booking.status === "cancelled" ? (
          <>
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => onChangeStatus(booking, "pending")}>
              Reabrir
            </button>
            <IconAction
              icon={Trash2}
              label="Borrar esta reserva"
              className="hover:text-[color:var(--color-danger)]"
              disabled={busy}
              onClick={() => onDelete(booking)}
            />
          </>
        ) : (
          <button type="button" className="btn btn-danger" disabled={busy} onClick={() => onChangeStatus(booking, "cancelled")}>
            Cancelar
          </button>
        )}
        <span className="text-micro text-ink-faint ml-auto">
          Recibida el {new Date(booking.createdAt).toLocaleDateString("es-CL")}
        </span>
      </div>
    </article>
  );
}

export default function ReservasClient({ canSeeAll, baseUrl }: { canSeeAll: boolean; baseUrl: string }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [slug, setSlug] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [viewingAll, setViewingAll] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [teamName, setTeamName] = useState<string | null>(null);
  const [teamDraft, setTeamDraft] = useState("");
  const [savingTeam, setSavingTeam] = useState(false);

  const load = useCallback(
    async (all: boolean) => {
      const res = await fetch(`/api/reservas${all ? "?all=true" : ""}`);
      const data = await readJsonBody(res);
      setLoading(false);
      if (!res.ok) {
        setError(data.error || "No se pudieron cargar las reservas.");
        return;
      }
      setError("");
      setBookings(data.bookings ?? []);
      setSlug(data.slug ?? null);
      setTeamName(data.teamName ?? null);
      setTeamDraft((actual) => (actual ? actual : data.teamName ?? ""));
    },
    []
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(viewingAll);
  }, [load, viewingAll]);

  const shareUrl = slug ? `${baseUrl}/boost/${slug}` : "";

  async function saveTeam() {
    const nombre = teamDraft.trim();
    if (!nombre) return;
    setSavingTeam(true);
    const res = await fetch("/api/reservas/team", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teamName: nombre }),
    });
    const data = await readJsonBody(res);
    setSavingTeam(false);
    if (!res.ok) {
      toast.error("No se pudo guardar", data.error || "Prueba con otro nombre.");
      return;
    }
    setTeamName(data.teamName ?? nombre);
    setTeamDraft(data.teamName ?? nombre);
    setSlug(data.slug ?? null);
    toast.success("Team guardado", "Tu link quedo actualizado, vuelve a copiarlo.");
  }

  async function copyLink() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success("Link copiado", "Pégalo en tu anuncio de Discord.");
    } catch {
      toast.error("No se pudo copiar", "Copia el link a mano desde el recuadro.");
    }
  }

  async function deleteBooking(booking: Booking) {
    const ok = await confirm(
      `Se va de la bandeja para siempre: ${booking.offerTitle}, de ${booking.buyerDiscordUsername ?? "un comprador"}.`,
      { title: "¿Borrar esta reserva?", confirmLabel: "Borrar", danger: true }
    );
    if (!ok) return;

    setBusyId(booking.id);
    const res = await fetch(`/api/reservas/${booking.id}`, { method: "DELETE" });
    const data = await readJsonBody(res);
    setBusyId(null);
    if (!res.ok) {
      toast.error("No se pudo borrar", data.error || "Inténtalo de nuevo.");
      return;
    }
    setBookings((prev) => prev.filter((b) => b.id !== booking.id));
    toast.success("Reserva borrada");
  }

  async function changeStatus(booking: Booking, status: BoostStatus) {
    setBusyId(booking.id);
    const res = await fetch(`/api/reservas/${booking.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const data = await readJsonBody(res);
    setBusyId(null);
    if (!res.ok) {
      toast.error("No se pudo actualizar", data.error || "Inténtalo de nuevo.");
      return;
    }
    setBookings((prev) => prev.map((b) => (b.id === booking.id ? { ...b, status } : b)));
    toast.success(`Reserva ${STATUS_LABEL[status].toLowerCase()}`);
  }

  const pendingCount = useMemo(() => bookings.filter((b) => b.status === "pending").length, [bookings]);

  return (
    <div className="portal-container">
      <PageHeader
        eyebrow="Ventas"
        icon={Ticket}
        title="Reservas"
        description="Las solicitudes que llegan por tu link de la tienda. Cada una es un aviso: el bookeo real lo sigues cerrando tú, a mano."
        actions={
          <div className="flex items-center gap-3">
            {canSeeAll && (
              <>
                <Link href="/reservas/catalogo" className="btn btn-secondary">
                  <Store className="w-3.5 h-3.5" />
                  Catálogo
                </Link>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setLoading(true);
                    setViewingAll((v) => !v);
                  }}
                >
                  {viewingAll ? "Solo las mías" : "Ver todo el flujo"}
                </button>
              </>
            )}
          </div>
        }
      />

      <section className="card p-5 mb-6">
        <p className="section-eyebrow">Tu team</p>
        <h2 className="font-heading text-lg font-semibold text-ink mt-1">
          Con qué nombre vendes
        </h2>
        <p className="text-meta text-ink-muted mt-1 max-w-[62ch]">
          La tienda se muestra con este nombre a quien entre por tu link, y el
          link cambia con él. Se sugirió con tu nombre de Discord para que el
          comprador vea lo mismo en la web y en el chat.
        </p>

        <div className="flex flex-wrap items-center gap-2 mt-3.5">
          <div className="flex items-center gap-2 flex-1 min-w-[260px]">
            <span className="text-meta text-ink-faint shrink-0">Team</span>
            <input
              type="text"
              value={teamDraft}
              onChange={(e) => setTeamDraft(e.target.value)}
              maxLength={24}
              placeholder="Tu nombre"
              className="input flex-1"
              aria-label="Nombre de tu team"
            />
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={saveTeam}
            disabled={savingTeam || !teamDraft.trim() || teamDraft.trim() === (teamName ?? "")}
          >
            {savingTeam ? "Guardando…" : "Guardar nombre"}
          </button>
        </div>

        <div className="section-rule my-4" />

        <p className="section-eyebrow">Tu link</p>
        <p className="text-meta text-ink-muted mt-1 max-w-[62ch]">
          Toda reserva que entre por tu link queda a tu nombre y solo la ves tú.
        </p>
        <div className="flex flex-wrap items-center gap-2 mt-3.5">
          <code
            className="font-data text-sm px-3 py-2 rounded-lg flex-1 min-w-[260px] truncate"
            style={{ backgroundColor: "var(--color-surface-2)", border: "1px solid var(--color-line)" }}
          >
            {shareUrl || "Generando tu link…"}
          </code>
          <button type="button" className="btn btn-primary" onClick={copyLink} disabled={!shareUrl}>
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? "Copiado" : "Copiar link"}
          </button>
          {shareUrl && (
            <a href={shareUrl} target="_blank" rel="noopener noreferrer" className="btn btn-secondary">
              <ExternalLink className="w-3.5 h-3.5" />
              Ver la tienda
            </a>
          )}
        </div>
        <p className="text-label text-ink-faint mt-2">
          Si cambias el nombre, el link cambia y el anterior deja de servir.
          Vuelve a copiarlo en tus anuncios.
        </p>
      </section>

      <div className="section-rule" />
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
        <div>
          <p className="section-eyebrow">{viewingAll ? "Todo el guild" : "Tus solicitudes"}</p>
          <h2 className="section-title">{viewingAll ? "Flujo completo" : "Mis reservas"}</h2>
        </div>
        {!loading && bookings.length > 0 && (
          <p className="text-meta text-ink-muted">
            {bookings.length} en total{pendingCount > 0 ? ` · ${pendingCount} sin responder` : ""}
          </p>
        )}
      </div>

      {error && (
        <p className="text-sm mb-3" style={{ color: "var(--color-danger)" }}>
          {error}
        </p>
      )}

      {loading ? (
        <LoadingState variant="rows" count={3} />
      ) : bookings.length === 0 ? (
        <div className="card p-8 text-center">
          <Swords className="w-6 h-6 mx-auto mb-2 text-ink-faint" />
          <p className="text-ink-muted text-sm">
            {viewingAll
              ? "Todavía no entró ninguna reserva por la tienda."
              : "Todavía no te llegó ninguna reserva. Comparte tu link para empezar."}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {bookings.map((booking, index) => (
            <BookingCard
              key={booking.id}
              booking={booking}
              index={index}
              onChangeStatus={changeStatus}
              onDelete={deleteBooking}
              busy={busyId === booking.id}
              showOwner={viewingAll}
            />
          ))}
        </div>
      )}
    </div>
  );
}
