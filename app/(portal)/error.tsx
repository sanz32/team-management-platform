"use client";

import { useEffect } from "react";
import ErrorScreen from "../components/ErrorScreen";

export default function PortalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[portal] error de pantalla:", error);
  }, [error]);

  return (
    <ErrorScreen
      message="Esta pantalla no pudo cargar sus datos. Prueba de nuevo; si vuelve a pasar, avisa a un oficial con la referencia de abajo."
      digest={error.digest}
      onRetry={reset}
    />
  );
}
