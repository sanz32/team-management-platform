"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Bell } from "lucide-react";
import { readJsonBody } from "@/lib/read-json";

interface NotificationItem {
  id: string;
  type: string;
  message: string;
  rosterId: string | null;
  read: boolean;
  createdAt: string;
}

function targetHref(type: string): string {
  if (type === "payment" || type === "ob_discount") return "/balance";
  if (type === "point_assigned" || type === "point_appeal_decision") return "/puntos";
  if (type === "swap_request" || type === "swap_response") return "/dias-libres?panel=intercambios";
  return "/roster";
}

function targetLabel(type: string): string {
  if (type === "payment" || type === "ob_discount") return "Ver balance";
  if (type === "point_assigned" || type === "point_appeal_decision") return "Ver puntos";
  if (type === "swap_request" || type === "swap_response") return "Ver intercambio";
  return "Ver roster";
}

const POLL_MS = 15 * 60 * 1000;

const NOTIFICATIONS_POLLING_ENABLED = true;
const DISMISSED_TOAST_KEY = "portal_notif_toast_seen";
const MAX_TOASTS = 3;

function loadDismissedToastIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(DISMISSED_TOAST_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function markToastDismissed(id: string) {
  try {
    const dismissed = loadDismissedToastIds();
    dismissed.add(id);
    const trimmed = Array.from(dismissed).slice(-200);
    window.localStorage.setItem(DISMISSED_TOAST_KEY, JSON.stringify(trimmed));
  } catch {
  }
}

const subscribeNoop = () => () => {};
function useHasMounted() {
  return useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false
  );
}

interface ToastState {
  visible: NotificationItem[];
  queue: NotificationItem[];
}

function splitToastState(candidates: NotificationItem[]): ToastState {
  return { visible: candidates.slice(0, MAX_TOASTS), queue: candidates.slice(MAX_TOASTS) };
}

export default function NotificationBell() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [open, setOpen] = useState(false);
  const [toastState, setToastState] = useState<ToastState>({ visible: [], queue: [] });
  const mounted = useHasMounted();
  const wrapperRef = useRef<HTMLDivElement>(null);

  function dismissToast(id: string) {
    markToastDismissed(id);
    setToastState((prev) => {
      const visible = prev.visible.filter((t) => t.id !== id);
      const queue = prev.queue.filter((t) => t.id !== id);
      if (visible.length < MAX_TOASTS && queue.length > 0) {
        const [next, ...restQueue] = queue;
        return { visible: [...visible, next], queue: restQueue };
      }
      return { visible, queue };
    });
  }

  const load = useCallback(async () => {
    const res = await fetch("/api/notifications");
    if (!res.ok) return;
    const data = await readJsonBody(res);
    const list: NotificationItem[] = data.notifications ?? [];
    setItems(list);

    const dismissed = loadDismissedToastIds();
    const candidates = list
      .filter((n) => !n.read && !dismissed.has(n.id))
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
    setToastState(splitToastState(candidates));
  }, []);

  useEffect(() => {
    if (!NOTIFICATIONS_POLLING_ENABLED) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    function scheduleNext() {
      if (cancelled) return;
      if (document.visibilityState === "hidden") return;
      timer = setTimeout(runLoad, POLL_MS);
    }

    async function runLoad() {
      await load();
      scheduleNext();
    }

    runLoad();

    function onVisibilityChange() {
      if (document.visibilityState === "visible") {
        if (timer) clearTimeout(timer);
        runLoad();
      } else if (timer) {
        clearTimeout(timer);
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [load]);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  function markRead(id: string) {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    fetch(`/api/notifications/${id}`, { method: "PATCH" }).catch(() => {});
    dismissToast(id);
  }

  const unreadCount = items.filter((n) => !n.read).length;

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative w-8 h-8 rounded-full flex items-center justify-center text-ink-muted hover:text-ink hover:bg-[color:var(--color-surface-2)] transition-colors"
        title="Notificaciones"
      >
        <Bell className="w-[18px] h-[18px]" />
        {unreadCount > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full text-micro font-bold flex items-center justify-center text-white"
            style={{ backgroundColor: "var(--color-danger)" }}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute left-0 top-full mt-2 w-80 max-h-96 overflow-y-auto rounded-xl shadow-lg z-50"
          style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-line)" }}
        >
          <div className="px-4 py-3 border-b border-line">
            <p className="font-heading font-semibold text-ink text-sm">
              Notificaciones{unreadCount > 0 && ` (${unreadCount})`}
            </p>
          </div>
          {items.length === 0 ? (
            <p className="px-4 py-6 text-xs text-ink-faint text-center">No tienes notificaciones.</p>
          ) : (
            items.map((n) => (
              <Link
                key={n.id}
                href={targetHref(n.type)}
                onClick={() => {
                  markRead(n.id);
                  setOpen(false);
                }}
                className="block px-4 py-3 border-b border-line last:border-0 hover:bg-[color:var(--color-surface-2)] transition-colors"
              >
                <p className={`text-xs ${n.read ? "text-ink-faint" : "text-ink font-medium"}`}>
                  {!n.read && (
                    <span
                      className="inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle"
                      style={{ backgroundColor: "var(--color-danger)" }}
                    />
                  )}
                  {n.message}
                </p>
              </Link>
            ))
          )}
        </div>
      )}

      {mounted &&
        toastState.visible.length > 0 &&
        createPortal(
          <div className="fixed bottom-6 right-6 z-[999] flex flex-col-reverse gap-3">
            {toastState.visible.map((t) => (
              <div
                key={t.id}
                className="w-80 card p-4"
                style={{ boxShadow: "0 16px 40px -16px rgba(0,0,0,0.5)" }}
                role="alert"
              >
                <p className="text-xs text-ink-muted mb-2 font-semibold flex items-center gap-1.5">
                  <Bell className="w-3.5 h-3.5" style={{ color: "var(--color-primary)" }} />
                  Notificación nueva
                </p>
                <p className="text-sm text-ink mb-3">{t.message}</p>
                <div className="flex gap-2">
                  <Link
                    href={targetHref(t.type)}
                    className="btn btn-primary !py-1.5 !px-3 text-xs"
                    onClick={() => markRead(t.id)}
                  >
                    {targetLabel(t.type)}
                  </Link>
                  <button
                    type="button"
                    onClick={() => dismissToast(t.id)}
                    className="btn btn-ghost !py-1.5 !px-3 text-xs"
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            ))}
            {toastState.queue.length > 0 && (
              <p
                className="w-80 text-center text-xs font-medium py-1.5 rounded-full text-ink-muted"
                style={{ backgroundColor: "var(--color-surface-2)" }}
              >
                +{toastState.queue.length}{" "}
                {toastState.queue.length === 1 ? "notificación más" : "notificaciones más"}
              </p>
            )}
          </div>,
          document.body
        )}
    </div>
  );
}
