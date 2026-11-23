"use client";

import { usePathname } from "next/navigation";

export default function ZoomScope({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const zoomed = !pathname.startsWith("/login");

  return <div style={zoomed ? ({ zoom: 1.1 } as React.CSSProperties) : undefined}>{children}</div>;
}
