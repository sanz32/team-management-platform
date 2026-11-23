"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { Search, CornerDownLeft, User, Swords } from "lucide-react";
import { sectionsForRole } from "@/lib/portal-sections";
import { classColor } from "@/lib/wow-classes";
import { readJsonBody } from "@/lib/read-json";
import { foldForSearch } from "@/lib/search-fold";

interface MemberHit {
  id: string;
  name: string;
  avatarUrl: string | null;
}

interface CharacterHit {
  id: string;
  name: string;
  realm: string;
  class: string | null;
  ilvl: number | null;
}

type Hit =
  | { kind: "section"; key: string; label: string; sub: string; href: string; icon: React.ComponentType<{ className?: string }> }
  | { kind: "member"; key: string; label: string; sub: string; href: string; avatarUrl: string | null }
  | { kind: "character"; key: string; label: string; sub: string; href: string; color: string };

export default function GlobalSearch({ appRole }: { appRole?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [members, setMembers] = useState<MemberHit[]>([]);
  const [characters, setCharacters] = useState<CharacterHit[]>([]);
  const [active, setActive] = useState(0);
  const [mounted, setMounted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const sections = useMemo(() => sectionsForRole(appRole), [appRole]);

  const sectionHits = useMemo<Hit[]>(() => {
    const q = foldForSearch(query.trim());
    const list = q
      ? sections.filter((s) => foldForSearch(s.label).includes(q) || foldForSearch(s.area).includes(q))
      :
        sections.filter((s) => s.inNavBar);
    return list.map((s) => ({
      kind: "section" as const,
      key: `section:${s.href}`,
      label: s.label,
      sub: s.area,
      href: s.href,
      icon: s.icon,
    }));
  }, [query, sections]);

  const hits = useMemo<Hit[]>(
    () => [
      ...sectionHits,
      ...members.map((m) => ({
        kind: "member" as const,
        key: `member:${m.id}`,
        label: m.name,
        sub: "Ver sus personajes",
        href: `/characters?view=admin&member=${encodeURIComponent(m.id)}`,
        avatarUrl: m.avatarUrl,
      })),
      ...characters.map((c) => ({
        kind: "character" as const,
        key: `character:${c.id}`,
        label: c.name,
        sub: c.ilvl ? `${c.realm} · ilvl ${c.ilvl}` : c.realm,
        href: `/characters/${c.id}`,
        color: classColor(c.class),
      })),
    ],
    [sectionHits, members, characters],
  );

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: controller.signal });
        if (!res.ok) return;
        const data = await readJsonBody(res);
        setMembers(data.members ?? []);
        setCharacters(data.characters ?? []);
      } catch {
      }
    }, 220);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const hitCount = hits.length;
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActive(0);
  }, [hitCount, query]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setMembers([]);
    setCharacters([]);
  }, []);

  const go = useCallback(
    (hit: Hit) => {
      close();
      router.push(hit.href);
    },
    [close, router],
  );

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((i) => (hits.length === 0 ? 0 : (i + 1) % hits.length));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((i) => (hits.length === 0 ? 0 : (i - 1 + hits.length) % hits.length));
      } else if (e.key === "Enter") {
        const hit = hits[active];
        if (hit) {
          e.preventDefault();
          go(hit);
        }
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, hits, active, close, go]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const trigger = (
    <button
      type="button"
      className="search-trigger"
      onClick={() => setOpen(true)}
      aria-label="Buscar en el portal"
      title="Buscar (Ctrl+K)"
    >
      <Search className="w-4 h-4 shrink-0" />
      <span className="search-trigger-label">Buscar</span>
      <kbd className="search-kbd">Ctrl K</kbd>
    </button>
  );

  if (!mounted) return trigger;

  return (
    <>
      {trigger}
      {open &&
        createPortal(
          <div className="search-overlay" onClick={close}>
            <div
              className="search-panel"
              role="dialog"
              aria-modal="true"
              aria-label="Buscar en el portal"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="search-field">
                <Search className="w-4 h-4 shrink-0 text-ink-faint" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => {
                    const value = e.target.value;
                    setQuery(value);
                    if (value.trim().length < 2) {
                      setMembers([]);
                      setCharacters([]);
                    }
                  }}
                  placeholder="Busca una sección, un miembro o un personaje..."
                  className="search-input"
                  aria-label="Término de búsqueda"
                />
                <kbd className="search-kbd">Esc</kbd>
              </div>

              <div className="search-results" ref={listRef}>
                {hits.length === 0 ? (
                  <p className="search-empty">
                    {query.trim().length < 2
                      ? "Escribe al menos dos letras."
                      : `Sin resultados para "${query.trim()}".`}
                  </p>
                ) : (
                  hits.map((hit, i) => (
                    <button
                      key={hit.key}
                      type="button"
                      data-active={i === active}
                      className="search-hit"
                      onMouseEnter={() => setActive(i)}
                      onClick={() => go(hit)}
                    >
                      <span className="search-hit-icon">
                        {hit.kind === "section" && <hit.icon className="w-4 h-4" />}
                        {hit.kind === "member" &&
                          (hit.avatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={hit.avatarUrl} alt="" className="w-5 h-5 rounded-full object-cover" />
                          ) : (
                            <User className="w-4 h-4" />
                          ))}
                        {hit.kind === "character" && <Swords className="w-4 h-4" style={{ color: hit.color }} />}
                      </span>
                      <span className="search-hit-body">
                        <span
                          className="search-hit-label"
                          style={hit.kind === "character" ? { color: hit.color } : undefined}
                        >
                          {hit.label}
                        </span>
                        <span className="search-hit-sub">{hit.sub}</span>
                      </span>
                      {i === active && <CornerDownLeft className="w-3.5 h-3.5 shrink-0 text-ink-faint" />}
                    </button>
                  ))
                )}
              </div>

              <div className="search-footer">
                <span>
                  <kbd className="search-kbd">↑</kbd>
                  <kbd className="search-kbd">↓</kbd> para moverte
                </span>
                <span>
                  <kbd className="search-kbd">Enter</kbd> para abrir
                </span>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
