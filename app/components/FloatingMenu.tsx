"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export default function FloatingMenu({
  open,
  onClose,
  anchorEl,
  align = "start",
  children,
}: {
  open: boolean;
  onClose: () => void;
  anchorEl: HTMLElement | null;
  align?: "start" | "end";
  children: React.ReactNode;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [measured, setMeasured] = useState(false);

  useLayoutEffect(() => {
    function computeInitialPosition() {
      if (!open || !anchorEl) {
        setPos(null);
        setMeasured(false);
        return;
      }
      const rect = anchorEl.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, left: align === "end" ? rect.right : rect.left });
      setMeasured(false);
    }
    computeInitialPosition();
  }, [open, anchorEl, align]);

  useLayoutEffect(() => {
    function measureAndClamp() {
      if (!open || measured || !pos || !anchorEl || !menuRef.current) return;
      const rect = anchorEl.getBoundingClientRect();
      const menuWidth = menuRef.current.getBoundingClientRect().width;
      let left = align === "end" ? rect.right - menuWidth : rect.left;
      const maxLeft = window.innerWidth - menuWidth - 8;
      left = Math.min(Math.max(left, 8), maxLeft);
      setPos({ top: rect.bottom + 4, left });
      setMeasured(true);
    }
    measureAndClamp();
  }, [open, measured, pos, anchorEl, align]);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: MouseEvent) {
      const target = e.target as Node;
      if (menuRef.current?.contains(target) || anchorEl?.contains(target)) return;
      onClose();
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    function handleScroll(e: Event) {
      if (menuRef.current && e.target instanceof Node && menuRef.current.contains(e.target)) return;
      onClose();
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKey);
    window.addEventListener("scroll", handleScroll, true);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKey);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [open, onClose, anchorEl]);

  if (!open || !pos) return null;

  return createPortal(
    <div
      ref={menuRef}
      className="card p-2 fixed z-50 w-max min-w-[140px] max-w-[260px] max-h-64 overflow-y-auto"
      style={{ top: pos.top, left: pos.left }}
    >
      {children}
    </div>,
    document.body
  );
}
