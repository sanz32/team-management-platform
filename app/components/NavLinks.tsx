"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { sectionsForRole, type PortalSection } from "@/lib/portal-sections";


function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function NavLinks({
  badgePath,
  badgeUpdateId,
  appRole,
}: {
  badgePath?: string | null;
  badgeUpdateId?: string | null;
  appRole?: string;
}) {
  const pathname = usePathname();
  const [badgeCleared, setBadgeCleared] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const links = sectionsForRole(appRole).filter((s) => s.inNavBar);

  useEffect(() => {
    if (!badgePath || !badgeUpdateId || badgeCleared) return;
    if (!isActive(pathname, badgePath)) return;

    async function ackVisit() {
      setBadgeCleared(true);
      try {
        await fetch("/api/product-updates/ack", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ updateId: badgeUpdateId, visit: true }),
        });
      } catch {
      }
    }

    ackVisit();
  }, [pathname, badgePath, badgeUpdateId, badgeCleared]);

  const showBadge = !!badgePath && !badgeCleared;


  useEffect(() => {
    if (!menuOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  function renderLink(l: PortalSection) {
    const Icon = l.icon;
    const active = isActive(pathname, l.href);
    return (
      <Link
        key={l.href}
        href={l.href}
        onClick={() => setMenuOpen(false)}
        title={l.label}
        aria-label={l.label}
        className={`nav-slot${active ? " nav-slot-active" : ""}`}
        style={{ position: "relative" }}
      >
        <Icon className="w-4 h-4" />
        <span>{l.label}</span>
        {showBadge && l.href === badgePath && (
          <span
            className="nav-slot-dot w-1.5 h-1.5 rounded-full absolute top-1 right-1"
            style={{ backgroundColor: "var(--color-primary)" }}
            aria-hidden
          />
        )}
      </Link>
    );
  }

  return (
    <>
      <div className="nav-tray">{links.map(renderLink)}</div>

      <button
        type="button"
        className="nav-toggle"
        aria-expanded={menuOpen}
        aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"}
        onClick={() => setMenuOpen((v) => !v)}
        style={{ position: "relative" }}
      >
        {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        {showBadge && !menuOpen && (
          <span
            className="nav-slot-dot w-1.5 h-1.5 rounded-full absolute top-1 right-1"
            style={{ backgroundColor: "var(--color-primary)" }}
            aria-hidden
          />
        )}
      </button>

      {menuOpen && (
        <div className="nav-mobile-panel" id="nav-mobile-panel">
          <div className="portal-container is-wide">
            <div className="nav-mobile-list">{links.map(renderLink)}</div>
          </div>
        </div>
      )}
    </>
  );
}
