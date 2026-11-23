"use client";

import { useState } from "react";
import {
  Laptop2,
  Download,
  Unlink,
  ShieldOff,
  ChevronUp,
  Wifi,
  Volume2,
  Puzzle,
  Radio,
} from "lucide-react";
import { useConfirm } from "@/app/components/ConfirmDialogProvider";
import { useToast } from "@/app/components/ToastProvider";
import { useRefetchOnReturn } from "@/lib/useRefetchOnReturn";
import { cascadeStyle } from "@/lib/cascade";
import SegmentedToggle from "@/app/components/SegmentedToggle";
import { GG_ADDON_URL } from "@/lib/gg-addon";
import PageHeader from "@/app/components/PageHeader";
import { readJsonBody } from "@/lib/read-json";

interface OwnDevice {
  linkedAt: string | null;
  lastUsedAt: string | null;
}

interface MemberDevice {
  userId: string;
  name: string;
  discordUsername: string | null;
  linkedAt: string | null;
  lastUsedAt: string | null;
  isSelf: boolean;
}

const LINKED_AT_FORMATTER = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

function formatLinkedAt(iso: string | null): string {
  if (!iso) return "fecha desconocida";
  return LINKED_AT_FORMATTER.format(new Date(iso));
}

function formatLastUsed(iso: string | null): string {
  if (!iso) return "Todavía no ha sincronizado";
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "Último sync hace instantes";
  if (minutes < 60) return `Último sync hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Último sync hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return `Último sync hace ${days} d`;
}

function TrayLocationDiagram() {
  return (
    <figure className="mt-3 mb-1">
      <div
        className="inline-flex items-center gap-3 rounded-lg px-3 py-2"
        style={{
          border: "1px solid var(--color-line-strong)",
          backgroundColor: "var(--color-canvas)",
        }}
        aria-hidden
      >
        <ChevronUp className="w-4 h-4" style={{ color: "var(--color-ink-faint)" }} />
        <Wifi className="w-4 h-4" style={{ color: "var(--color-ink-faint)" }} />
        <Volume2 className="w-4 h-4" style={{ color: "var(--color-ink-faint)" }} />

        <span className="relative shrink-0 flex items-center justify-center">
          <span
            className="absolute -inset-1 rounded-lg"
            style={{ border: "1.5px solid var(--color-primary)" }}
          />
          <svg viewBox="0 0 100 100" className="w-7 h-7 rounded-md">
            <rect width="100" height="100" rx="22" fill="#06060c" />
            <g stroke="#a855f7" strokeWidth="10" strokeLinecap="round" fill="none">
              <path d="M50,50 L50.5,25" transform="rotate(0 50 50)" />
<circle cx="50" cy="22" r="6" transform="rotate(0 50 50)" />
              <path d="M50,50 L50.5,25" transform="rotate(120 50 50)" />
<circle cx="50" cy="22" r="6" transform="rotate(120 50 50)" />
              <path d="M50,50 L50.5,25" transform="rotate(240 50 50)" />
<circle cx="50" cy="22" r="6" transform="rotate(240 50 50)" />
            </g>
            <circle cx="50" cy="50" r="13" fill="#f7f5fb" />
          </svg>
        </span>

        <div
          className="text-right leading-tight pl-1"
          style={{ color: "var(--color-ink-muted)", fontSize: "10px" }}
        >
          <div>21:14</div>
          <div>27/07/2026</div>
        </div>
      </div>
      <figcaption className="text-ink-faint text-label mt-1.5 leading-relaxed max-w-sm">
        Así se ve en la esquina inferior derecha, junto al reloj.{" "}
        <span className="text-ink-muted">
          Si no lo encuentras, haz clic en la flecha ^ : Windows esconde ahí los iconos nuevos.
        </span>
      </figcaption>
    </figure>
  );
}

const TRAY_MENU_ITEMS = [
  { label: "Sin vincular", muted: true },
  { label: "https://portal.example.com", muted: true },
  { separator: true },
  { label: "Sincronizar ahora", muted: true },
  { label: "Vincular cuenta", highlight: true },
  { label: "Elegir carpeta de WoW...", muted: false },
  { separator: true },
  { label: "Iniciar con Windows", muted: false, checkbox: true },
  { separator: true },
  { label: "Salir", muted: false },
];

function TrayMenuDiagram() {
  return (
    <figure className="mt-3 mb-1">
      <div
        className="inline-block rounded-lg overflow-hidden text-xs select-none"
        style={{
          border: "1px solid var(--color-line-strong)",
          backgroundColor: "var(--color-surface-2)",
          minWidth: "15rem",
        }}
        aria-hidden
      >
        {TRAY_MENU_ITEMS.map((item, i) =>
          item.separator ? (
            <div key={i} className="border-t" style={{ borderColor: "var(--color-line)" }} />
          ) : (
            <div
              key={i}
              className="flex items-center gap-2 px-3 py-1.5"
              style={
                item.highlight
                  ? {
                      backgroundColor: "color-mix(in srgb, var(--color-primary) 18%, transparent)",
                      color: "var(--color-primary)",
                      fontWeight: 600,
                    }
                  : { color: item.muted ? "var(--color-ink-faint)" : "var(--color-ink-muted)" }
              }
            >
              {item.checkbox && <span className="opacity-70">✓</span>}
              <span className="truncate">{item.label}</span>
              {item.highlight && <span className="ml-auto shrink-0">◄</span>}
            </div>
          )
        )}
      </div>
      <figcaption className="text-ink-faint text-label mt-1.5">
        El menú que aparece al hacer clic derecho en el icono de la bandeja.
      </figcaption>
    </figure>
  );
}

function InstallStep({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-3">
      <span
        className="w-6 h-6 rounded-md shrink-0 flex items-center justify-center text-xs font-bold text-ink-muted mt-0.5"
        style={{
          border: "1px solid var(--color-line-strong)",
          backgroundColor: "var(--color-surface-2)",
        }}
        aria-hidden
      >
        {n}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink">{title}</p>
        {children}
      </div>
    </li>
  );
}

function AddonInfoSection() {
  return (
    <div className="space-y-5">
      <div className="card p-5">
        <div className="flex items-start gap-3">
          <Puzzle className="w-5 h-5 shrink-0 mt-0.5" style={{ color: "var(--color-epic)" }} />
          <div>
            <p className="text-sm font-semibold text-ink">GG, el addon del guild</p>
            <p className="text-ink-faint text-xs mt-1 leading-relaxed">
              Corre DENTRO del juego (reemplaza a AlterEgo) y guarda automáticamente,
              mientras juegas, los mismos datos que ves en esta pantalla -- sin que
              tengas que abrir ningún panel ni tocar nada.
            </p>
          </div>
        </div>
        <a href={GG_ADDON_URL} target="_blank" rel="noopener noreferrer" className="btn btn-primary mt-4">
          <Download className="w-3.5 h-3.5" />
          Descargar el addon GG
        </a>
      </div>

      <div className="card p-5">
        <p className="text-sm font-semibold text-ink mb-3">Qué recopila</p>
        <ul className="space-y-2 text-ink-faint text-xs leading-relaxed list-disc pl-4">
          <li>Tu Gran Vault de la semana, con el ítem real de cada casilla ya elegible.</li>
          <li>Las mazmorras de Mítica+ que completaste esta semana, con su mejor nivel.</li>
          <li>La llave de Mítica+ que llevas en la bolsa.</li>
          <li>Oro y monedas de la temporada (crests, Manaflux, Voidcore, etc.).</li>
          <li>Tu mejor score de Mítica+ de la temporada.</li>
        </ul>
      </div>

      <div className="card p-5">
        <div className="flex items-start gap-3">
          <Radio className="w-5 h-5 shrink-0 mt-0.5" style={{ color: "var(--color-secondary)" }} />
          <div>
            <p className="text-sm font-semibold text-ink">
              ¿Cómo llega esto al portal sin descargar Desktop Sync?
            </p>
            <p className="text-ink-faint text-xs mt-1.5 leading-relaxed">
              El addon por sí solo NO tiene forma de conectarse a internet -- eso lo
              hace la app de escritorio (pestaña &ldquo;App&rdquo;). Pero no hace falta que
              TÚ la tengas instalada: mientras juegas con GG activo, el addon avisa
              tus datos por el canal de guild dentro del juego, y CUALQUIER otro
              miembro que tenga GG + la app corriendo al mismo tiempo los recibe y
              los sube al portal por ti, en automático.
            </p>
            <p className="text-ink-faint text-xs mt-2 leading-relaxed">
              Es más lento y menos completo que sincronizar tú mismo (depende de
              que haya alguien más del guild online con los dos activos a la vez),
              pero alcanza para que el resto vea tu progreso sin que instales nada
              más. Si quieres que tus datos suban al instante y siempre, la vía
              directa sigue siendo vincular tu propia PC en la pestaña
              &ldquo;App&rdquo;.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AppSyncClient({
  isAdmin,
  downloadAvailable,
}: {
  isAdmin: boolean;
  downloadAvailable: boolean;
}) {
  const confirm = useConfirm();
  const toast = useToast();
  const [tab, setTab] = useState<"app" | "addon">("app");
  const [own, setOwn] = useState<OwnDevice | null>(null);
  const [members, setMembers] = useState<MemberDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/sync/desktop/devices");
      const data = await readJsonBody(res);
      if (!res.ok) {
        setError(data.error || "No se pudo cargar el estado de la app.");
        return;
      }
      setOwn(data.own ?? null);
      setMembers(data.members ?? []);
    } catch {
      setError("No se pudo conectar con el portal. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  useRefetchOnReturn(load);

  async function revoke(userId: string, label: string, isSelf: boolean) {
    const message = isSelf
      ? "¿Desvincular tu PC? Va a dejar de sincronizar oro, M+, Gran Vault y monedas hasta que la vuelvas a vincular desde la app."
      : `¿Revocar el sync de ${label}? Su PC va a dejar de subir datos al portal hasta que la vuelva a vincular.`;

    const confirmed = await confirm(message, {
      title: isSelf ? "Desvincular dispositivo" : "Revocar sync",
      confirmLabel: isSelf ? "Desvincular" : "Revocar",
      danger: true,
    });
    if (!confirmed) return;

    setRevokingId(userId);
    setError("");
    try {
      const res = await fetch(`/api/sync/desktop/devices/${userId}`, { method: "DELETE" });
      const data = await readJsonBody(res);
      if (!res.ok) {
        setError(data.error || "No se pudo revocar el dispositivo.");
        toast.error("No se pudo revocar el dispositivo", data.error || undefined);
        return;
      }
      await load();
      toast.success("Dispositivo revocado");
    } catch {
      setError("No se pudo conectar con el portal. Intenta de nuevo.");
      toast.error("No se pudo conectar con el portal", "Intenta de nuevo.");
    } finally {
      setRevokingId(null);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Tu cuenta"
        icon={Laptop2}
        title="App / Addon"
        description="Dos formas de subir tu progreso al portal -- los datos que la API de Blizzard no expone (oro, rating de M+, Gran Vault, monedas). La pestaña App administra el vínculo de esta PC; Addon explica cómo funciona GG, qué recopila, y cómo llega igual aunque no instales nada acá."
      />

      <div className="mb-8">
        <SegmentedToggle
          ariaLabel="App o Addon"
          value={tab}
          onChange={setTab}
          options={[
            { value: "app", label: "App" },
            { value: "addon", label: "Addon" },
          ]}
        />
      </div>

      {tab === "addon" && <AddonInfoSection />}

      {tab === "app" && (
        <>
          {error && (
            <div
              className="text-sm rounded-xl p-4 mb-6"
              style={{
                backgroundColor: "color-mix(in srgb, var(--color-danger) 12%, transparent)",
                border: "1px solid color-mix(in srgb, var(--color-danger) 35%, transparent)",
                color: "var(--color-danger)",
              }}
            >
              {error}
            </div>
          )}

          <h2 className="text-caption !text-ink-faint mb-2">Mi dispositivo</h2>

          {loading ? (
            <p className="text-ink-muted text-sm py-4">Cargando...</p>
          ) : own ? (
            <div className="card p-5 flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <Laptop2 className="w-5 h-5 shrink-0" style={{ color: "var(--color-success)" }} />
                <div>
                  <p className="text-sm font-semibold text-ink">PC vinculada</p>
                  <p className="text-ink-faint text-xs mt-0.5">
                    Vinculada el {formatLinkedAt(own.linkedAt)} · {formatLastUsed(own.lastUsedAt)}
                  </p>
                </div>
              </div>
              <button
                onClick={() => revoke("me", "tu PC", true)}
                disabled={revokingId !== null}
                className="btn btn-danger shrink-0"
              >
                <Unlink className="w-3.5 h-3.5" />
                {revokingId === "me" ? "Desvinculando..." : "Desvincular"}
              </button>
            </div>
          ) : (
            <div className="card p-5">
              <div className="flex items-start gap-3">
                <Download className="w-5 h-5 shrink-0 mt-0.5 text-ink-faint" />
                <div>
                  <p className="text-sm font-semibold text-ink">Sin ninguna PC vinculada</p>
                  <p className="text-ink-faint text-xs mt-1 leading-relaxed">
                    El portal cuenta con una app que lee el addon GG (o AlterEgo) y
                    sube al portal la información que la API de Blizzard no aporta.
                    Se instala una vez y sincroniza sola.
                  </p>
                </div>
              </div>

              <ol className="mt-5 space-y-4">
                <InstallStep n={1} title="Descarga la app">
                  {downloadAvailable ? (
                    <a href="/api/app/download" className="btn btn-primary mt-2">
                      <Download className="w-3.5 h-3.5" />
                      Descargar Desktop Sync
                    </a>
                  ) : (
                    <p className="text-ink-faint text-xs mt-1">
                      La descarga todavía no está publicada. Pídesela a un admin.
                    </p>
                  )}
                </InstallStep>

                <InstallStep n={2} title="Instálala">
                  <p className="text-ink-faint text-xs mt-1 leading-relaxed">
                    Se instala sola y arranca al terminar, sin abrir ninguna ventana:
                    queda en la bandeja del sistema, al lado del reloj. Windows puede
                    advertir que el instalador no está firmado; es esperable.
                  </p>
                  <TrayLocationDiagram />
                </InstallStep>

                <InstallStep n={3} title="Vincúlala con tu cuenta">
                  <p className="text-ink-faint text-xs mt-1 leading-relaxed">
                    Haz clic derecho en el icono de la bandeja y elige{" "}
                    <span className="text-ink font-medium">&ldquo;Vincular cuenta&rdquo;</span>. Se abre
                    esta misma web para que apruebes la PC con un clic.
                  </p>
                  <TrayMenuDiagram />
                </InstallStep>
              </ol>
            </div>
          )}

          {isAdmin && (
            <>
              <h2 className="text-caption !text-ink-faint mt-8 mb-2">Dispositivos del guild</h2>
              <p className="text-ink-faint text-xs mb-3">
                Cada miembro puede tener una sola PC vinculada — volver a vincular
                reemplaza la anterior. Revocar corta el sync de inmediato: su app va a
                mostrar &ldquo;Token inválido&rdquo; hasta que la vuelva a vincular.
              </p>

              {loading ? (
                <p className="text-ink-muted text-sm">Cargando...</p>
              ) : (
                <div className="card divide-y divide-line">
                  {members.map((m, index) => (
                    <div
                      key={m.userId}
                      className="flex items-center justify-between gap-4 px-5 py-3.5 cascade-item"
                      style={cascadeStyle(index)}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-ink truncate">
                          {m.name}
                          {m.isSelf && <span className="text-ink-faint font-normal"> (tú)</span>}
                        </p>
                        <p className="text-ink-faint text-xs truncate">
                          Vinculada el {formatLinkedAt(m.linkedAt)} · {formatLastUsed(m.lastUsedAt)}
                        </p>
                      </div>
                      <button
                        onClick={() => revoke(m.userId, m.name, m.isSelf)}
                        disabled={revokingId !== null}
                        className="btn btn-ghost shrink-0"
                        style={{ color: "var(--color-danger)" }}
                      >
                        <ShieldOff className="w-3.5 h-3.5" />
                        {revokingId === m.userId ? "Revocando..." : "Revocar"}
                      </button>
                    </div>
                  ))}
                  {members.length === 0 && (
                    <p className="text-ink-faint text-xs text-center py-10">
                      Ningún miembro tiene la app vinculada todavía.
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
