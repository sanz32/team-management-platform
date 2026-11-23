import Link from "next/link";
import { GG_ADDON_URL } from "@/lib/gg-addon";

export default function SyncCta({ isOwner, message }: { isOwner: boolean; message: string }) {
  if (!isOwner) {
    return (
      <p className="text-ink-faint text-sm">
        La información de este personaje todavía no está sincronizada.
      </p>
    );
  }

  return (
    <>
      <p className="text-ink-faint text-sm">{message}</p>
      <div className="flex flex-wrap items-center justify-center gap-2 mt-3">
        <Link href="/app" className="btn btn-secondary">
          Vincular Desktop Sync
        </Link>
        <span className="text-ink-faint text-xs font-semibold uppercase tracking-wide">o</span>
        <a href={GG_ADDON_URL} target="_blank" rel="noopener noreferrer" className="btn btn-secondary">
          Descargar Addon GG
        </a>
      </div>
    </>
  );
}
