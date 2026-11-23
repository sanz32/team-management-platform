"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

import { cascadeStyle } from "@/lib/cascade";

const REVEAL_BOTTOM_SHRINK = 0.22;
const REVEAL_ROOT_MARGIN = `0px 0px -${REVEAL_BOTTOM_SHRINK * 100}% 0px`;

function watchViewportChanges(check: () => void): () => void {
  window.addEventListener("scroll", check, { passive: true });
  window.addEventListener("resize", check);
  let raf1 = 0;
  let raf2 = 0;
  raf1 = requestAnimationFrame(() => {
    raf2 = requestAnimationFrame(check);
  });
  return () => {
    window.removeEventListener("scroll", check);
    window.removeEventListener("resize", check);
    cancelAnimationFrame(raf1);
    cancelAnimationFrame(raf2);
  };
}

function isOnScreen(el: Element): boolean {
  const rect = el.getBoundingClientRect();
  return rect.bottom > 0 && rect.top < window.innerHeight;
}

function cannotReachActiveZone(el: Element): boolean {
  if (!isOnScreen(el)) return false;
  const doc = document.documentElement;
  const scrollRestante = Math.max(0, doc.scrollHeight - window.innerHeight - window.scrollY);
  const lineaDeDisparo = window.innerHeight * (1 - REVEAL_BOTTOM_SHRINK);
  return el.getBoundingClientRect().top - scrollRestante > lineaDeDisparo;
}

export type RevealKind = "rise" | "lift" | "unveil" | "settle";

export function useReveal<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const finish = () => el.classList.add("is-done");

    const reducedMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reducedMotion || typeof IntersectionObserver === "undefined") {
      el.classList.add("is-in", "is-done");
      return;
    }

    let timer = 0;
    let revealed = false;

    const reveal = () => {
      if (revealed) return;
      revealed = true;
      el.classList.add("is-in");
      el.addEventListener("transitionend", finish, { once: true });
      window.clearTimeout(timer);
      timer = window.setTimeout(finish, 1600);
    };
    const hide = () => {
      if (!revealed || !canRehide(el)) return;
      revealed = false;
      window.clearTimeout(timer);
      el.removeEventListener("transitionend", finish);
      el.classList.remove("is-in", "is-done");
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) reveal();
          else hide();
        }
      },
      { threshold: 0.02, rootMargin: REVEAL_ROOT_MARGIN }
    );

    observer.observe(el);
    const stopFallbackWatch = watchViewportChanges(() => {
      if (revealed || !cannotReachActiveZone(el)) return;
      reveal();
    });

    return () => {
      observer.disconnect();
      stopFallbackWatch();
      window.clearTimeout(timer);
      el.removeEventListener("transitionend", finish);
    };
  }, []);

  return ref;
}

function canRehide(el: HTMLElement): boolean {
  return el.querySelector('[aria-expanded="true"]') === null;
}

type CascadeApply = (armed: boolean, order: number) => void;

type CascadeController = {
  register: (node: Element, apply: CascadeApply) => () => void;
  setFrozen: (frozen: boolean) => void;
  dispose: () => void;
};

function createCascadeController(once: boolean): CascadeController {
  const slots = new Map<Element, { apply: CascadeApply; armed: boolean; sticky: boolean }>();
  let observer: IntersectionObserver | null = null;
  let stopFallbackWatch: (() => void) | null = null;
  let frozen = false;

  const armBatch = (targets: Element[]) => {
    const sorted = targets
      .map((node) => ({ node, rect: node.getBoundingClientRect() }))
      .sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left);

    let order = 0;
    for (const { node } of sorted) {
      const slot = slots.get(node);
      if (!slot || slot.armed) continue;
      slot.armed = true;
      slot.apply(true, order);
      order += 1;
    }
  };

  const ensureObserver = () => {
    if (observer || typeof IntersectionObserver === "undefined") return;

    observer = new IntersectionObserver(
      (entries) => {
        const entering: Element[] = [];
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entering.push(entry.target);
            continue;
          }
          if (once || frozen) continue;
          const slot = slots.get(entry.target);
          if (!slot || !slot.armed) continue;
          if (slot.sticky) {
            if (isOnScreen(entry.target)) continue;
            slot.sticky = false;
          }
          if (!canRehide(entry.target as HTMLElement)) continue;
          slot.armed = false;
          slot.apply(false, 0);
        }
        if (entering.length > 0) armBatch(entering);
      },
      { threshold: 0.02, rootMargin: REVEAL_ROOT_MARGIN }
    );

    for (const node of slots.keys()) observer.observe(node);

    stopFallbackWatch = watchViewportChanges(() => {
      let anyStuck = false;
      for (const [node, slot] of slots) {
        if (!slot.armed && cannotReachActiveZone(node)) {
          anyStuck = true;
          break;
        }
      }
      if (anyStuck) {
        const pending: Element[] = [];
        for (const [node, slot] of slots) {
          if (!slot.armed) pending.push(node);
        }
        if (pending.length > 0) armBatch(pending);
      }

      if (once) return;
      for (const [node, slot] of slots) {
        if (!slot.armed || slot.sticky) continue;
        if (isOnScreen(node)) continue;
        if (!canRehide(node as HTMLElement)) continue;
        slot.armed = false;
        slot.apply(false, 0);
      }
    });
  };

  let lastImmediateAt = 0;
  let immediateOrder = 0;
  const armIfAlreadyOnScreen = (node: Element) => {
    const slot = slots.get(node);
    if (!slot || slot.armed || !isOnScreen(node)) return;
    const now = performance.now();
    immediateOrder = now - lastImmediateAt < 32 ? immediateOrder + 1 : 0;
    lastImmediateAt = now;
    slot.armed = true;
    slot.sticky = true;
    slot.apply(true, immediateOrder);
  };

  return {
    register(node, apply) {
      const previo = slots.get(node);
      slots.set(node, {
        apply,
        armed: node.classList.contains("cascade-item"),
        sticky: previo?.sticky ?? false,
      });
      if (typeof IntersectionObserver === "undefined") {
        apply(true, 0);
        return () => slots.delete(node);
      }
      ensureObserver();
      observer?.observe(node);
      armIfAlreadyOnScreen(node);
      return () => {
        observer?.unobserve(node);
        slots.delete(node);
      };
    },
    setFrozen(value) {
      frozen = value;
    },
    dispose() {
      observer?.disconnect();
      observer = null;
      stopFallbackWatch?.();
      stopFallbackWatch = null;
    },
  };
}

const CascadeContext = createContext<CascadeController | null>(null);

export function CascadeScope({
  children,
  once = false,
}: {
  children: React.ReactNode;
  once?: boolean;
}) {
  const [controller] = useState(() => createCascadeController(once));

  useEffect(() => () => controller.dispose(), [controller]);

  return <CascadeContext.Provider value={controller}>{children}</CascadeContext.Provider>;
}

export function useCascadeSlot<T extends HTMLElement>(): [
  (node: T | null) => void,
  string,
  React.CSSProperties | undefined,
] {
  const controller = useContext(CascadeContext);
  const [slot, setSlot] = useState({ armed: false, order: 0 });
  const unregisterRef = useRef<(() => void) | null>(null);

  const ref = useCallback(
    (node: T | null) => {
      unregisterRef.current?.();
      unregisterRef.current = null;
      if (!node) return;
      if (!controller) {
        setSlot({ armed: true, order: 0 });
        return;
      }
      unregisterRef.current = controller.register(node, (armed, order) =>
        setSlot({ armed, order })
      );
    },
    [controller]
  );

  return [
    ref,
    slot.armed ? "cascade-item" : "cascade-pending",
    slot.armed ? cascadeStyle(slot.order) : undefined,
  ];
}

export function useCascadeFreeze(): (frozen: boolean) => void {
  const controller = useContext(CascadeContext);
  return useCallback((frozen: boolean) => controller?.setFrozen(frozen), [controller]);
}

export function Reveal({
  kind = "rise",
  className = "",
  children,
}: {
  kind?: RevealKind;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useReveal<HTMLDivElement>();
  return (
    <div ref={ref} className={`reveal-scope ${className}`}>
      <div className="reveal" data-reveal={kind}>
        {children}
      </div>
    </div>
  );
}

export function SectionHead({
  eyebrow,
  title,
  meta,
  description,
  accent = "var(--color-primary)",
  actions,
}: {
  eyebrow: string;
  title: React.ReactNode;
  meta?: React.ReactNode;
  description?: React.ReactNode;
  accent?: string;
  actions?: React.ReactNode;
}) {
  const ref = useReveal<HTMLElement>();
  return (
    <header ref={ref} className="reveal-head mb-6" style={{ "--rule-accent": accent } as React.CSSProperties}>
      <div className="section-rule" />
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <span className="section-eyebrow">
            {eyebrow}
            {meta != null && (
              <>
                <span className="mx-2 text-ink-faint/50">/</span>
                <span className="text-ink-muted">{meta}</span>
              </>
            )}
          </span>
          <h2 className="section-title">{title}</h2>
          {description && <p className="section-desc">{description}</p>}
        </div>
        {actions && <div className="section-head-actions shrink-0">{actions}</div>}
      </div>
    </header>
  );
}

export function Section({
  eyebrow,
  title,
  meta,
  description,
  accent,
  actions,
  children,
}: {
  eyebrow: string;
  title: React.ReactNode;
  meta?: React.ReactNode;
  description?: React.ReactNode;
  accent?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="portal-section">
      <SectionHead
        eyebrow={eyebrow}
        title={title}
        meta={meta}
        description={description}
        accent={accent}
        actions={actions}
      />
      {children}
    </section>
  );
}
