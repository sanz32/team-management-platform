"use client";

import Link from "next/link";
import { useBoostLang } from "./BoostLangProvider";

export default function BoostNotFound() {
  const { t } = useBoostLang();

  return (
    <main className="bst-shell" style={{ paddingBlock: "5rem 6rem" }}>
      <h1 className="bst-title" style={{ fontSize: "clamp(2rem, 4.5vw, 3rem)" }}>
        {t.notFoundTitle}
      </h1>
      <p className="bst-lead" style={{ marginTop: "1rem", maxWidth: "52ch" }}>
        {t.notFoundBody}
      </p>
      <div className="bst-hero-actions" style={{ marginTop: "2rem" }}>
        <Link href="/boost" className="bst-cta">
          {t.backHome}
        </Link>
      </div>
    </main>
  );
}
