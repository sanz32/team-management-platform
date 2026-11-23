"use client";

import Link from "next/link";
import { useBoostLang } from "./BoostLangProvider";

function GalaxyMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} role="presentation" aria-hidden>
      <defs>
        <linearGradient id="bst-mark-grad" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="var(--color-primary-deep)" />
          <stop offset="1" stopColor="var(--color-primary-hover)" />
        </linearGradient>
      </defs>
      <g stroke="url(#bst-mark-grad)" strokeWidth="10" strokeLinecap="round" fill="none">
        <path d="M50,50 L50.5,25" transform="rotate(0 50 50)" />
<circle cx="50" cy="22" r="6" transform="rotate(0 50 50)" />
        <path d="M50,50 L50.5,25" transform="rotate(120 50 50)" />
<circle cx="50" cy="22" r="6" transform="rotate(120 50 50)" />
        <path d="M50,50 L50.5,25" transform="rotate(240 50 50)" />
<circle cx="50" cy="22" r="6" transform="rotate(240 50 50)" />
      </g>
      <circle cx="50" cy="50" r="13" fill="#fff3e6" />
    </svg>
  );
}

export default function BoostChrome({ children }: { children: React.ReactNode }) {
  const { lang, setLang, t } = useBoostLang();

  return (
    <>
      <header className="bst-top">
        <div className="bst-shell bst-top-row">
          <Link href="/boost" className="bst-wordmark">
            <GalaxyMark className="w-6 h-6 shrink-0" />
            Team Portal
          </Link>
          <button
            type="button"
            className="bst-lang"
            onClick={() => setLang(lang === "en" ? "es" : "en")}
            aria-label={t.langToggleLabel}
            title={t.langToggleLabel}
          >
            {t.langToggle}
          </button>
        </div>
      </header>

      {children}

      <footer className="bst-footer">
        <div className="bst-shell">{t.footerNote}</div>
      </footer>
    </>
  );
}
