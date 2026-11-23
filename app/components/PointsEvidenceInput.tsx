"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ClipboardPaste, ImageUp, X } from "lucide-react";

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.82;

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function compressImage(source: Blob): Promise<Blob | null> {
  const url = URL.createObjectURL(source);
  try {
    const image = await new Promise<HTMLImageElement | null>((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = url;
    });
    if (!image) return null;

    const scale = Math.min(1, MAX_DIMENSION / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.width * scale);
    canvas.height = Math.round(image.height * scale);

    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

    return await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((blob) => resolve(blob), "image/jpeg", JPEG_QUALITY);
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function PointsEvidenceInput({
  onChange,
  disabled = false,
}: {
  onChange: (blob: Blob | null) => void;
  disabled?: boolean;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [size, setSize] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const accept = useCallback(
    async (source: Blob | null | undefined) => {
      if (!source) return;
      setError(null);
      setWorking(true);
      try {
        const compressed = await compressImage(source);
        if (!compressed) {
          setError("No se pudo leer esa imagen. Prueba con un PNG o un JPG.");
          return;
        }
        setPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return URL.createObjectURL(compressed);
        });
        setSize(compressed.size);
        onChange(compressed);
      } finally {
        setWorking(false);
      }
    },
    [onChange]
  );

  function clear() {
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setSize(null);
    setError(null);
    onChange(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  useEffect(() => {
    if (disabled) return;
    function handleGlobalPaste(e: ClipboardEvent) {
      const active = document.activeElement as HTMLElement | null;
      const isTextField =
        active?.tagName === "INPUT" || active?.tagName === "TEXTAREA" || active?.isContentEditable;
      if (isTextField) return;
      const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith("image/"));
      if (!item) return;
      e.preventDefault();
      accept(item.getAsFile());
    }
    document.addEventListener("paste", handleGlobalPaste);
    return () => document.removeEventListener("paste", handleGlobalPaste);
  }, [disabled, accept]);

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    if (disabled) return;
    setDragActive(true);
  }
  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setDragActive(false);
  }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragActive(false);
    if (disabled) return;
    const file = Array.from(e.dataTransfer.files).find((f) => f.type.startsWith("image/"));
    if (!file) {
      setError("Suelta una imagen (PNG o JPG).");
      return;
    }
    accept(file);
  }

  return (
    <div
      aria-label="Captura"
      className="h-full min-h-[140px] rounded-xl p-4 transition-colors flex flex-col items-center justify-center gap-2"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{
        backgroundColor: dragActive
          ? "color-mix(in srgb, var(--color-primary) 10%, var(--color-surface-2))"
          : "var(--color-surface-2)",
        border: dragActive ? "1px dashed var(--color-primary)" : "1px dashed var(--color-line-strong)",
      }}
    >
      {previewUrl ? (
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt="Captura"
              className="max-w-[220px] max-h-[150px] w-auto h-auto object-contain rounded-lg"
              style={{ border: "1px solid var(--color-line)" }}
            />
            <button
              type="button"
              onClick={clear}
              disabled={disabled}
              title="Quitar la captura"
              aria-label="Quitar la captura"
              className="absolute -top-2 -right-2 p-1 rounded-full text-ink-faint transition-colors hover:text-[color:var(--color-danger)] disabled:opacity-50"
              style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-line)" }}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div>
            <p className="text-sm text-ink font-medium">Captura lista</p>
            <p className="text-xs text-ink-faint">
              {size !== null ? `${formatSize(size)} · se sube al guardar` : "Se sube al guardar"}
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex flex-col items-center gap-1.5">
            <ClipboardPaste className="w-7 h-7 text-ink-faint" />
            <p className="text-sm text-ink font-medium">
              {working ? "Procesando..." : dragActive ? "Suelta la imagen" : "Pulsa Ctrl+V"}
            </p>
            <p className="text-xs text-ink-faint">o arrastra una imagen aquí</p>
          </div>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || working}
            className="btn btn-secondary !py-2 !px-4 text-sm"
          >
            <ImageUp className="w-4 h-4" />
            Subir archivo
          </button>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => accept(e.target.files?.[0])}
      />

      {error && (
        <p className="text-xs text-center" style={{ color: "var(--color-danger)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
