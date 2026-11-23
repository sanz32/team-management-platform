"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BOOST_REGION } from "@/lib/boost";
import { readJsonBody } from "@/lib/read-json";
import { classColor } from "@/lib/wow-classes";
import { useBoostLang } from "./BoostLangProvider";
import { CAJA } from "./caja";

interface FoundCharacter {
  name: string;
  realm: string;
  realmSlug: string;
  region: string;
  class: string | null;
  spec: string | null;
  ilvl: number | null;
  avatarUrl: string | null;
}

interface RealmOption {
  slug: string;
  name: string;
}

const REALM_SUGGESTIONS = 8;

export interface BookingTarget {
  offerId: string | null;
  slotId?: string | null;
}

export default function BookingForm({
  target,
  refSlug,
  formToken,
  missingTargetMessage,
}: {
  target: BookingTarget;
  refSlug: string | null;
  formToken: string;
  missingTargetMessage?: string;
}) {
  const { t } = useBoostLang();

  const [realm, setRealm] = useState("");
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [honeypot, setHoneypot] = useState("");

  const [realms, setRealms] = useState<RealmOption[]>([]);
  const [realmOpen, setRealmOpen] = useState(false);
  const realmBoxRef = useRef<HTMLDivElement>(null);

  const [character, setCharacter] = useState<FoundCharacter | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const listo = !!target.offerId;

  const pendiente = !listo ? (missingTargetMessage ?? t.needSlot) : !character ? t.needCharacter : null;

  useEffect(() => {
    let cancelled = false;
    fetch("/api/boost/realms")
      .then((res) => readJsonBody(res))
      .then((data) => {
        if (!cancelled && Array.isArray(data.realms)) setRealms(data.realms as RealmOption[]);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!realmOpen) return;
    function onPointerDown(event: MouseEvent) {
      if (!realmBoxRef.current?.contains(event.target as Node)) setRealmOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [realmOpen]);

  const realmMatches = useMemo(() => {
    const query = realm.trim().toLowerCase();
    if (!query) return realms.slice(0, REALM_SUGGESTIONS);
    const starts: RealmOption[] = [];
    const contains: RealmOption[] = [];
    for (const r of realms) {
      const lower = r.name.toLowerCase();
      if (lower.startsWith(query)) starts.push(r);
      else if (lower.includes(query)) contains.push(r);
      if (starts.length >= REALM_SUGGESTIONS) break;
    }
    return [...starts, ...contains].slice(0, REALM_SUGGESTIONS);
  }, [realm, realms]);

  const realmIsExact = realms.some((r) => r.name.toLowerCase() === realm.trim().toLowerCase());

  async function lookupCharacter() {
    if (!name.trim() || !realm.trim()) return;
    setLookingUp(true);
    setError("");

    try {
      const res = await fetch("/api/boost/character-lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, realm, region: BOOST_REGION }),
      });
      const data = await readJsonBody(res);

      if (!res.ok) {
        setError(t.lookupError);
        return;
      }
      if (!data.found) {
        setError(t.notFound);
        return;
      }
      setCharacter(data.character as FoundCharacter);
    } catch {
      setError(t.lookupError);
    } finally {
      setLookingUp(false);
    }
  }

  async function submit() {
    if (!listo) {
      setError(missingTargetMessage ?? t.needSlot);
      return;
    }
    if (!character) {
      setError(t.needCharacter);
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      await enviarSolicitud(character);
    } catch {
      setSubmitting(false);
      setError(t.submitError);
    }
  }

  async function enviarSolicitud(character: FoundCharacter) {
    const res = await fetch("/api/boost/discord/authorize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        offerId: target.offerId,
        slotId: target.slotId ?? undefined,
        ref: refSlug,
        characterName: character.name,
        characterRealm: character.realm,
        characterRegion: character.region,
        characterClass: character.class,
        characterSpec: character.spec,
        characterIlvl: character.ilvl,
        note,
        formToken,
        website: honeypot,
      }),
    });
    const data = await readJsonBody(res);

    if (!res.ok || !data.url) {
      setSubmitting(false);
      setError(data.url === null && data.ok ? "" : t.submitError);
      return;
    }

    window.location.assign(data.url);
  }

  return (
    <>
      <section style={CAJA}>
        <h2 className="bst-def-title" style={{ fontSize: "1.1rem" }}>
          {t.characterTitle}
        </h2>
        <p className="bst-def-body" style={{ maxWidth: "60ch" }}>
          {t.characterLead}
        </p>

        {character ? (
          <div
            className="bst-found mt-4"
            style={{ "--color-q": classColor(character.class) } as React.CSSProperties}
          >
            {character.avatarUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={character.avatarUrl} alt="" width={56} height={56} className="bst-found-avatar" />
            )}
            <div className="min-w-0">
              <p className="bst-found-name">
                {character.name}
                <span style={{ color: "var(--color-ink-faint)", fontWeight: 400 }}>-{character.realm}</span>
              </p>
              <p className="text-meta" style={{ color: "var(--color-ink-muted)", marginTop: "0.15rem" }}>
                {[
                  character.region.toUpperCase(),
                  character.spec && character.class ? `${character.spec} ${character.class}` : character.class,
                  character.ilvl ? `ilvl ${character.ilvl}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <button
              type="button"
              className="bst-cta-quiet"
              style={{ marginLeft: "auto" }}
              onClick={() => {
                setCharacter(null);
                setError("");
              }}
            >
              {t.changeCharacter}
            </button>
          </div>
        ) : (
          <>
            <div
              className="grid gap-3 mt-4"
              style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}
            >
              <label className="bst-field">
                <span className="bst-label">{t.characterName}</span>
                <input
                  className="bst-input"
                  value={name}
                  autoComplete="off"
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      lookupCharacter();
                    }
                  }}
                />
              </label>
              <div className="bst-field bst-combo" ref={realmBoxRef}>
                <span className="bst-label">{t.realm}</span>
                <input
                  className="bst-input"
                  value={realm}
                  autoComplete="off"
                  role="combobox"
                  aria-expanded={realmOpen}
                  aria-controls="bst-realm-list"
                  aria-autocomplete="list"
                  aria-label={t.realmSearch}
                  onFocus={() => setRealmOpen(true)}
                  onChange={(e) => {
                    setRealm(e.target.value);
                    setRealmOpen(true);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setRealmOpen(false);
                    if (e.key === "Enter" && realmMatches.length > 0 && !realmIsExact) {
                      e.preventDefault();
                      setRealm(realmMatches[0].name);
                      setRealmOpen(false);
                    }
                  }}
                />
                {realmOpen && realmMatches.length > 0 && !realmIsExact && (
                  <ul className="bst-combo-list" id="bst-realm-list">
                    {realmMatches.map((r) => (
                      <li key={r.slug}>
                        <button
                          type="button"
                          className="bst-combo-option"
                          onClick={() => {
                            setRealm(r.name);
                            setRealmOpen(false);
                          }}
                        >
                          {r.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <button
              type="button"
              className="bst-cta mt-4"
              onClick={lookupCharacter}
              disabled={lookingUp || !name.trim() || !realm.trim()}
            >
              {lookingUp ? t.lookingUp : t.lookup}
            </button>
          </>
        )}

        <div className="bst-hp" aria-hidden>
          <label htmlFor="bst-website">Website</label>
          <input
            id="bst-website"
            name="website"
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={honeypot}
            onChange={(e) => setHoneypot(e.target.value)}
          />
        </div>
      </section>

      <section style={CAJA}>
        <label className="bst-field">
          <span className="bst-label">{t.noteLabel}</span>
          <textarea
            className="bst-input"
            rows={3}
            value={note}
            placeholder={t.notePlaceholder}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>

        {error && (
          <p className="bst-alert mt-4" role="alert">
            {error}
          </p>
        )}

        {!error && pendiente && <p className="bst-hint mt-4">{pendiente}</p>}

        <button
          type="button"
          className="bst-cta mt-4"
          onClick={submit}
          disabled={submitting || !listo || !character}
        >
          {submitting ? t.submitting : t.continueDiscord}
        </button>
      </section>
    </>
  );
}
