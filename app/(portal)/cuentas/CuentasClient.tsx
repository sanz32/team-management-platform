"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Link2, ShieldCheck } from "lucide-react";
import PageHeader from "@/app/components/PageHeader";

const WCL_OAUTH_ERROR_LABELS: Record<string, string> = {
  no_autorizado: "Solo un admin puede conectar la cuenta de Warcraft Logs.",
  estado_invalido: "La conexión se interrumpió (estado inválido). Intenta de nuevo.",
  intercambio_token: "Warcraft Logs rechazó la autorización. Intenta de nuevo.",
  guardado: "Se autorizó la cuenta pero no se pudo guardar la conexión. Intenta de nuevo.",
};

export default function CuentasClient({
  showWcl,
  wclConnectedAs,
  wclConnected,
}: {
  showWcl: boolean;
  wclConnectedAs: string | null;
  wclConnected: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [wclConnectedFlag] = useState(() => searchParams.get("wcl_connected"));
  const [wclError] = useState(() => searchParams.get("wcl_error"));

  useEffect(() => {
    if (wclConnectedFlag || wclError) {
      router.replace("/cuentas", { scroll: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <PageHeader
        eyebrow="Tu cuenta"
        icon={Link2}
        title="Cuentas"
        description="Sesiones externas vinculadas al portal, usadas para validar APIs de terceros."
      />

      {wclConnectedFlag && (
        <div
          className="flex items-center gap-2.5 text-sm rounded-xl p-4 mb-5"
          style={{
            backgroundColor: "color-mix(in srgb, var(--color-success) 12%, transparent)",
            border: "1px solid color-mix(in srgb, var(--color-success) 35%, transparent)",
            color: "var(--color-success)",
          }}
        >
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          Cuenta de Warcraft Logs conectada.
        </div>
      )}

      {wclError && (
        <div
          className="text-sm rounded-xl p-4 mb-5"
          style={{
            backgroundColor: "color-mix(in srgb, var(--color-danger) 12%, transparent)",
            border: "1px solid color-mix(in srgb, var(--color-danger) 35%, transparent)",
            color: "var(--color-danger)",
          }}
        >
          {WCL_OAUTH_ERROR_LABELS[wclError] ?? "No se pudo conectar la cuenta de Warcraft Logs."}
        </div>
      )}

      {showWcl && (
        <div className="card p-5 mb-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <ShieldCheck
              className="w-5 h-5 shrink-0"
              style={{ color: wclConnected ? "var(--color-success)" : "var(--color-ink-faint)" }}
            />
            <div>
              <p className="text-sm font-semibold text-ink">
                {wclConnected ? "Cuenta de Warcraft Logs conectada" : "Sin cuenta de Warcraft Logs conectada"}
              </p>
              <p className="text-ink-faint text-xs mt-0.5">
                {wclConnected
                  ? `Conectado como ${wclConnectedAs ?? "cuenta sin nombre"} — puede leer reportes privados del guild.`
                  : "Sin conectar, solo se pueden importar reportes públicos (no privados/restringidos al guild)."}
              </p>
            </div>
          </div>
          <a href="/api/wcl/oauth/start" className="btn btn-secondary shrink-0">
            <Link2 className="w-3.5 h-3.5" />
            {wclConnected ? "Reconectar" : "Conectar cuenta de WCL"}
          </a>
        </div>
      )}

      <div className="card px-6 py-12 text-center text-ink-faint text-sm">
        No hay más cuentas vinculadas.
      </div>
    </div>
  );
}
