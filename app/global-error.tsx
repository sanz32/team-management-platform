"use client";

import { useEffect, useState } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [enTienda] = useState(
    () => typeof window !== "undefined" && window.location.pathname.startsWith("/boost")
  );

  useEffect(() => {
    console.error("[portal] error global:", error);
  }, [error]);

  return (
    <html lang={enTienda ? "en" : "es"}>
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#0b0e15",
          color: "#eef1f8",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          padding: "2rem",
        }}
      >
        <div style={{ textAlign: "center", maxWidth: "34rem" }}>
          <h1 suppressHydrationWarning style={{ fontSize: "1.75rem", margin: "0 0 0.75rem", letterSpacing: "-0.02em" }}>
            {enTienda ? "This page could not load" : "El portal no pudo arrancar"}
          </h1>
          <p suppressHydrationWarning style={{ color: "#99a1b7", fontSize: "0.9rem", lineHeight: 1.6, margin: "0 0 1.5rem" }}>
            {enTienda
              ? "Something broke while building the page, not while handling your booking. Reload it; if it keeps failing, message us on Discord."
              : "Falló algo del armado general de la página, no de una sección puntual. Vuelve a cargar; si sigue igual, avisa a un oficial."}
          </p>
          <button
            type="button"
            suppressHydrationWarning
            onClick={reset}
            style={{
              background: "linear-gradient(135deg, #ff7d0a, #c85e00)",
              color: "white",
              border: "none",
              borderRadius: "0.65rem",
              padding: "0.65rem 1.3rem",
              fontSize: "0.875rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {enTienda ? "Reload" : "Reintentar"}
          </button>
          {error.digest && (
            <p suppressHydrationWarning style={{ color: "#5c6478", fontSize: "0.7rem", marginTop: "1.25rem", fontFamily: "monospace" }}>
              {enTienda ? "Error reference" : "Referencia del error"}: {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
