import Link from "next/link";
import { Compass, Home } from "lucide-react";

export const metadata = { title: "Página no encontrada · Team Portal" };

export default function NotFound() {
  return (
    <div className="portal-container is-narrow py-24">
      <div className="flex flex-col items-center text-center gap-5">
        <span
          className="w-14 h-14 rounded-lg flex items-center justify-center shrink-0"
          style={{
            border: "1px solid var(--color-line-strong)",
            backgroundColor: "var(--color-surface-2)",
          }}
        >
          <Compass className="w-6 h-6" style={{ color: "var(--color-primary)" }} />
        </span>

        <div className="flex flex-col gap-2.5">
          <p className="page-eyebrow justify-center">Error 404</p>
          <h1 className="page-title" style={{ fontSize: "clamp(1.75rem, 4vw, 2.5rem)" }}>
            Esta pantalla no existe
          </h1>
          <p className="text-sm text-ink-muted max-w-[46ch] mx-auto leading-relaxed">
            El enlace que seguiste apunta a una sección que no está en el portal, o que
            cambió de dirección.
          </p>
        </div>

        <Link href="/" className="btn btn-primary">
          <Home className="w-4 h-4" />
          Ir a Inicio
        </Link>
      </div>
    </div>
  );
}
