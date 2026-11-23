"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

export function useRefetchOnReturn(refetch: () => void, watch?: unknown) {
  const refetchRef = useRef(refetch);
  useEffect(() => {
    refetchRef.current = refetch;
  });
  const pathname = usePathname();

  useEffect(() => {
    refetchRef.current();
  }, [pathname, watch]);
}
