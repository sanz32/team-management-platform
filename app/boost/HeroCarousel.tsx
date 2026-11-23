"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useBoostLang } from "./BoostLangProvider";

export interface HeroSlide {
  id: string;
  title: string;
  imageUrl: string | null;
  color: string | null;
}

const SLIDE_MS = 7_000;

export default function HeroCarousel({
  slides,
  children,
  heading,
  compact,
  aside,
}: {
  slides: HeroSlide[];
  children: React.ReactNode;
  heading?: React.ReactNode;
  compact?: boolean;
  aside?: React.ReactNode;
}) {
  const { t } = useBoostLang();
  const [activo, setActivo] = useState(0);
  const [pausado, setPausado] = useState(false);
  const contenedorRef = useRef<HTMLDivElement>(null);

  const total = slides.length;

  const irA = useCallback(
    (i: number) => {
      setActivo(((i % total) + total) % total);
    },
    [total]
  );

  useEffect(() => {
    if (total < 2 || pausado) return;
    const sinMovimiento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (sinMovimiento) return;

    const timer = setInterval(() => setActivo((i) => (i + 1) % total), SLIDE_MS);
    return () => clearInterval(timer);
  }, [total, pausado]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      irA(activo + 1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      irA(activo - 1);
    }
  }

  return (
    <section
      className="bst-hero-wrap"
      onMouseEnter={() => setPausado(true)}
      onMouseLeave={() => setPausado(false)}
    >
      <div
        className="bst-hero-track"
        ref={contenedorRef}
        style={{ transform: `translateX(${-activo * 100}%)` }}
        aria-hidden
      >
        {slides.map((slide) => (
          <div
            key={slide.id}
            className="bst-hero-slide"
            style={slide.imageUrl ? { backgroundImage: `url(${slide.imageUrl})` } : undefined}
          />
        ))}
      </div>

      <div className="bst-shell">
        <div className={`bst-hero-row ${aside ? "has-aside" : ""}`}>
          <div className={compact ? "bst-hero is-compact" : "bst-hero"}>
        {heading ?? (
          <h1 className="bst-title is-slides">
            {slides.map((slide, i) => (
              <span
                key={slide.id}
                className={i === activo ? "bst-hero-title-line is-on" : "bst-hero-title-line"}
                aria-hidden={i !== activo}
              >
                {slide.title}
              </span>
            ))}
          </h1>
        )}

        {children}

        {total > 1 && (
          <div
            className="bst-hero-dots"
            role="tablist"
            aria-label={t.heroSlidesLabel}
            onKeyDown={onKeyDown}
          >
            {slides.map((slide, i) => (
              <button
                key={slide.id}
                type="button"
                role="tab"
                aria-selected={i === activo}
                aria-label={slide.title}
                tabIndex={i === activo ? 0 : -1}
                className={i === activo ? "bst-hero-dot is-on" : "bst-hero-dot"}
                style={
                  slide.color ? ({ "--raid": slide.color } as React.CSSProperties) : undefined
                }
                onClick={() => irA(i)}
              />
            ))}
          </div>
            )}
          </div>
          {aside}
        </div>
      </div>
    </section>
  );
}
