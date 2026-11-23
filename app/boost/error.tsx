"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useBoostLang } from "./BoostLangProvider";

export default function BoostError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useBoostLang();

  useEffect(() => {
    console.error("[boost] error en la tienda:", error);
  }, [error]);

  return (
    <main className="bst-shell" style={{ paddingBlock: "5rem 6rem" }}>
      <h1 className="bst-title" style={{ fontSize: "clamp(2rem, 4.5vw, 3rem)" }}>
        {t.errorTitle}
      </h1>
      <p className="bst-lead" style={{ marginTop: "1rem", maxWidth: "56ch" }}>
        {t.errorBody}
      </p>
      <div className="bst-hero-actions" style={{ marginTop: "2rem" }}>
        <button type="button" onClick={reset} className="bst-cta">
          {t.retry}
        </button>
        <Link href="/boost" className="bst-cta-quiet">
          {t.backHome}
        </Link>
      </div>
    </main>
  );
}
