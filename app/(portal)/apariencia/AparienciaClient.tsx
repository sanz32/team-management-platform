"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, Palette } from "lucide-react";
import SegmentedToggle from "@/app/components/SegmentedToggle";
import MemberAvatar, { memberNameProps, type FrameNameStyle } from "../characters/MemberAvatar";
import PageHeader from "@/app/components/PageHeader";
import { readJsonBody } from "@/lib/read-json";
import { useToast } from "@/app/components/ToastProvider";

const DEFAULT_COLOR_1 = "#ff7d0a";
const DEFAULT_COLOR_2 = "#4fa6ff";

const NAME_STYLE_OPTIONS: { value: FrameNameStyle; label: string }[] = [
  { value: "gradient", label: "Degradado" },
  { value: "solid", label: "Sólido" },
  { value: "none", label: "Normal" },
];

export default function AparienciaClient({
  userId,
  discordUsername,
  avatarUrl,
  initialColor1,
  initialColor2,
  initialNameStyle,
  hasApp,
}: {
  userId: string;
  discordUsername: string;
  avatarUrl: string | null;
  initialColor1: string | null;
  initialColor2: string | null;
  initialNameStyle: string | null;
  hasApp: boolean;
}) {
  const toast = useToast();
  const [color1, setColor1] = useState(initialColor1 ?? DEFAULT_COLOR_1);
  const [color2, setColor2] = useState(initialColor2 ?? DEFAULT_COLOR_2);
  const [nameStyle, setNameStyle] = useState<FrameNameStyle>(
    (initialNameStyle as FrameNameStyle | null) ?? "gradient"
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  async function save(payload: { color1: string | null; color2: string | null; nameStyle: string | null }) {
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      const res = await fetch("/api/frame-colors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await readJsonBody(res).catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "No se pudo guardar.");
        toast.error("No se pudo guardar", data.error || undefined);
        return;
      }
      setSaved(true);
      toast.success("Guardado");
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError("No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }

  function handleSave() {
    save({ color1, color2, nameStyle });
  }

  function handleReset() {
    setColor1(DEFAULT_COLOR_1);
    setColor2(DEFAULT_COLOR_2);
    setNameStyle("gradient");
    save({ color1: null, color2: null, nameStyle: null });
  }

  const previewGroup = { user_id: userId, discord_username: discordUsername, avatar_url: avatarUrl };
  const previewNameProps = memberNameProps(true, nameStyle, color1, color2);

  return (
    <div>
      <PageHeader
        eyebrow="Tu cuenta"
        icon={Palette}
        title="Apariencia"
        description="Elige los colores y el estilo de tu marco de avatar en la lista de miembros del guild."
      />

      {!hasApp && (
        <div
          className="flex items-start gap-3 rounded-xl p-4 mb-6"
          style={{
            backgroundColor: "color-mix(in srgb, var(--color-warning) 12%, var(--color-surface))",
            border: "1px solid color-mix(in srgb, var(--color-warning) 40%, transparent)",
          }}
        >
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" style={{ color: "var(--color-warning)" }} />
          <div>
            <p className="text-sm font-semibold text-ink">
              Esto solo se ve si tienes la app Desktop Sync instalada
            </p>
            <p className="text-ink-muted text-xs mt-1 leading-relaxed">
              Puedes elegir tus colores desde ya y quedan guardados, pero el marco no va a
              aparecer en la lista de miembros del guild hasta que vincules la app.{" "}
              <Link href="/app" className="font-semibold underline" style={{ color: "var(--color-warning)" }}>
                Ir a /app para instalarla
              </Link>
              .
            </p>
          </div>
        </div>
      )}

      <div className="card p-5">
        <div className="flex items-center gap-3 mb-5">
          <Palette className="w-5 h-5 shrink-0" style={{ color: "var(--color-secondary)" }} />
          <div>
            <p className="text-sm font-semibold text-ink">Marco de avatar</p>
            <p className="text-ink-faint text-xs mt-0.5">
              Los mismos 2 colores se usan para el anillo del marco y para el nombre.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 mb-6 p-4 rounded-lg" style={{ backgroundColor: "var(--color-surface-2)" }}>
          <MemberAvatar group={previewGroup} size={60} hasApp accent1={color1} accent2={color2} />
          <span
            className={`font-heading font-bold text-xl truncate ${previewNameProps?.className ?? "text-ink"}`}
            style={previewNameProps?.style}
          >
            {discordUsername}
          </span>
        </div>

        <div className="flex flex-wrap items-end gap-6 mb-5">
          <label className="flex flex-col gap-1.5">
            <span className="text-ink-faint text-xs">Color 1</span>
            <input
              type="color"
              value={color1}
              onChange={(e) => setColor1(e.target.value)}
              className="w-16 h-10 rounded-md border border-line cursor-pointer bg-transparent"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-ink-faint text-xs">Color 2</span>
            <input
              type="color"
              value={color2}
              onChange={(e) => setColor2(e.target.value)}
              className="w-16 h-10 rounded-md border border-line cursor-pointer bg-transparent"
            />
          </label>
          <div className="flex flex-col gap-1.5">
            <span className="text-ink-faint text-xs">Estilo del nombre</span>
            <SegmentedToggle options={NAME_STYLE_OPTIONS} value={nameStyle} onChange={setNameStyle} />
          </div>
        </div>

        {error && (
          <p className="text-xs mb-3" style={{ color: "var(--color-danger)" }}>
            {error}
          </p>
        )}

        <div className="flex gap-2 flex-wrap">
          <button type="button" onClick={handleSave} disabled={saving} className="btn btn-primary">
            {saved ? "Guardado ✓" : saving ? "Guardando..." : "Guardar"}
          </button>
          <button type="button" onClick={handleReset} disabled={saving} className="btn btn-secondary">
            Restaurar predeterminado
          </button>
        </div>
      </div>
    </div>
  );
}
