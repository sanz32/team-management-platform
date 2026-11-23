"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { readJsonBody } from "@/lib/read-json";

interface FreshnessState {
  refreshedAt: string | null;
  refreshing: boolean;
  missingEncounters?: string[];
}

const STALE_AFTER_MS = 15 * 60 * 1000;

const HEARTBEAT_MS = 15 * 60 * 1000;
const ACTIVE_POLL_MS = 4_000;
const MAX_ACTIVE_POLL_MS = 90_000;

const RELATIVE_TIME_TICK_MS = 30_000;

const LOCKOUTS_REFRESH_STARTED_EVENT = "portal:lockouts-refresh-started";
const LOCKOUTS_REFRESHED_EVENT = "portal:lockouts-refreshed";

export function notifyLockoutsRefreshStarted(): void {
  window.dispatchEvent(new Event(LOCKOUTS_REFRESH_STARTED_EVENT));
}

export function notifyLockoutsRefreshed(): void {
  window.dispatchEvent(new Event(LOCKOUTS_REFRESHED_EVENT));
}

function isRefreshedAtStale(refreshedAt: string | null): boolean {
  if (!refreshedAt) return true;
  return Date.now() - new Date(refreshedAt).getTime() > STALE_AFTER_MS;
}

function formatRelative(refreshedAt: string): string {
  const minutes = Math.floor((Date.now() - new Date(refreshedAt).getTime()) / 60_000);
  if (minutes < 1) return "Datos actualizados hace instantes";
  if (minutes === 1) return "Datos actualizados hace 1 min";
  if (minutes < 60) return `Datos actualizados hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `Datos actualizados hace ${hours} h`;
}

interface LockoutFreshnessIndicatorProps {
  className?: string;
  refreshRouteOnComplete?: boolean;
  onRefreshComplete?: () => void;
}

export default function LockoutFreshnessIndicator({
  className,
  refreshRouteOnComplete,
  onRefreshComplete,
}: LockoutFreshnessIndicatorProps) {
  const router = useRouter();
  const [state, setState] = useState<FreshnessState | null>(null);
  const [gaveUp, setGaveUp] = useState(false);
  const manualActiveRef = useRef(false);
  const [manualActive, setManualActive] = useState(false);
  const manualActiveSinceRef = useRef<number | null>(null);
  const [, forceRelativeTimeTick] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeSinceRef = useRef<number | null>(null);
  const lastRefreshedAtRef = useRef<string | null | undefined>(undefined);
  const onRefreshCompleteRef = useRef(onRefreshComplete);
  useEffect(() => {
    onRefreshCompleteRef.current = onRefreshComplete;
  }, [onRefreshComplete]);

  useEffect(() => {
    let cancelled = false;

    function scheduleNext(delay: number) {
      if (cancelled) return;
      if (document.visibilityState === "hidden") return;
      timer.current = setTimeout(check, delay);
    }

    async function check() {
      let nextDelay = HEARTBEAT_MS;

      if (
        manualActiveRef.current &&
        manualActiveSinceRef.current !== null &&
        Date.now() - manualActiveSinceRef.current > MAX_ACTIVE_POLL_MS
      ) {
        manualActiveRef.current = false;
        manualActiveSinceRef.current = null;
        setManualActive(false);
      }

      try {
        const res = await fetch("/api/lockouts/freshness");
        if (!res.ok || cancelled) return;
        const data: FreshnessState = await readJsonBody(res);
        if (cancelled) return;
        setState(data);

        if (
          lastRefreshedAtRef.current !== undefined &&
          data.refreshedAt !== lastRefreshedAtRef.current
        ) {
          onRefreshCompleteRef.current?.();
        }
        lastRefreshedAtRef.current = data.refreshedAt;

        const showsRefreshing = data.refreshing || isRefreshedAtStale(data.refreshedAt);

        if (showsRefreshing) {
          if (activeSinceRef.current === null) {
            activeSinceRef.current = Date.now();
          }
          const elapsed = Date.now() - activeSinceRef.current;
          if (elapsed < MAX_ACTIVE_POLL_MS) {
            setGaveUp(false);
            nextDelay = ACTIVE_POLL_MS;
          } else {
            setGaveUp(true);
          }
        } else {
          activeSinceRef.current = null;
          setGaveUp(false);
        }
      } catch {
      }

      if (manualActiveRef.current) nextDelay = ACTIVE_POLL_MS;

      scheduleNext(nextDelay);
    }

    function handleManualStart() {
      manualActiveRef.current = true;
      setManualActive(true);
      manualActiveSinceRef.current = Date.now();
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(check, ACTIVE_POLL_MS);
    }

    function handleManualFinished() {
      manualActiveRef.current = false;
      setManualActive(false);
      manualActiveSinceRef.current = null;
      if (timer.current) clearTimeout(timer.current);
      check();
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        if (timer.current) clearTimeout(timer.current);
        check();
      } else if (timer.current) {
        clearTimeout(timer.current);
      }
    }

    window.addEventListener(LOCKOUTS_REFRESH_STARTED_EVENT, handleManualStart);
    window.addEventListener(LOCKOUTS_REFRESHED_EVENT, handleManualFinished);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    check();

    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
      window.removeEventListener(LOCKOUTS_REFRESH_STARTED_EVENT, handleManualStart);
      window.removeEventListener(LOCKOUTS_REFRESHED_EVENT, handleManualFinished);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    const id = setInterval(() => forceRelativeTimeTick((n) => n + 1), RELATIVE_TIME_TICK_MS);
    return () => clearInterval(id);
  }, []);

  const showRefreshing =
    manualActive || (!!state && !gaveUp && (state.refreshing || isRefreshedAtStale(state.refreshedAt)));

  const wasRefreshingRef = useRef(false);
  useEffect(() => {
    if (refreshRouteOnComplete && wasRefreshingRef.current && !showRefreshing) {
      router.refresh();
    }
    wasRefreshingRef.current = showRefreshing;
  }, [showRefreshing, refreshRouteOnComplete, router]);

  if (!state) return null;

  const missing = state.missingEncounters ?? [];
  const warning =
    missing.length > 0 ? (
      <span className="block mb-1">
        <span
          className="pill pill-warning"
          role="status"
          title={`Faltan lockouts por configurar: ${missing.join(", ")}. Los datos de esas raids están incompletos.`}
        >
          {missing.length} lockout{missing.length === 1 ? "" : "s"} sin configurar
        </span>
      </span>
    ) : null;

  if (showRefreshing) {
    return (
      <span className={className}>
        {warning}
        <span className="inline-flex items-center justify-center gap-1.5 text-xs text-ink-faint">
          <span className="sr-only">Actualizando datos</span>
          <span className="skeleton-shimmer h-3 w-28 rounded-full" aria-hidden="true" />
        </span>
      </span>
    );
  }

  if (!state.refreshedAt) return warning && <span className={className}>{warning}</span>;

  return (
    <span className={className}>
      {warning}
      <span className="text-xs text-ink-faint">{formatRelative(state.refreshedAt)}</span>
    </span>
  );
}
