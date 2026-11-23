"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { readJsonBody } from "@/lib/read-json";

const MIN_LENGTH = 2;
const MAX_LENGTH = 24;

export default function NicknameSetupClient() {
  const [step, setStep] = useState<"input" | "confirm">("input");
  const [nickname, setNickname] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function handleContinue() {
    const trimmed = nickname.trim();
    if (trimmed.length < MIN_LENGTH || trimmed.length > MAX_LENGTH) {
      setError(`El nick debe tener entre ${MIN_LENGTH} y ${MAX_LENGTH} caracteres.`);
      return;
    }
    setNickname(trimmed);
    setError("");
    setStep("confirm");
  }

  async function handleConfirm() {
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/nickname", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname }),
      });
      const data = await readJsonBody(res);
      if (!res.ok) {
        setError(data.error || "No se pudo guardar el nick.");
        setSubmitting(false);
        return;
      }
      window.location.href = "/";
    } catch {
      setError("No se pudo guardar el nick. Intenta de nuevo.");
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-sm w-full">
      <div className="flex justify-center mb-6">
        <span
          className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl font-bold text-white"
          style={{
            background: "linear-gradient(135deg, var(--color-primary), var(--color-primary-deep))",
            boxShadow: "0 8px 28px -8px rgba(255, 125, 10, 0.6)",
          }}
        >
          <Sparkles className="w-6 h-6" />
        </span>
      </div>

      <div className="card p-8 text-center">
        {step === "input" ? (
          <>
            <h1 className="text-display-lg text-ink mb-2">Crea tu Nickname</h1>
            <p className="text-ink-muted text-sm mb-6 leading-relaxed">
              Debes definir un nickname antes de continuar. Esta elección es
              permanente y no podrá modificarse después.
            </p>

            <input
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleContinue();
              }}
              placeholder="Nickname"
              maxLength={MAX_LENGTH}
              autoFocus
              className="input w-full px-3.5 py-2.5 text-sm text-center mb-1"
            />
            <p className="text-ink-faint text-xs mb-5">
              {nickname.trim().length}/{MAX_LENGTH}
            </p>

            {error && (
              <p className="text-xs mb-4" style={{ color: "var(--color-danger)" }}>
                {error}
              </p>
            )}

            <button onClick={handleContinue} className="btn btn-primary w-full">
              Continuar
            </button>
          </>
        ) : (
          <>
            <h1 className="text-display-lg text-ink mb-2">Confirma tu nick</h1>
            <p className="text-ink-muted text-sm mb-1">Tu nick va a ser:</p>
            <p
              className="font-heading text-3xl font-bold mb-5"
              style={{ color: "var(--color-gold)" }}
            >
              {nickname}
            </p>
            <p className="text-ink-muted text-xs mb-6 leading-relaxed">
              Una vez confirmado <strong className="text-ink">no se puede cambiar</strong>, así
              que asegúrate de que sea con el que todo el guild te identifica
              habitualmente.
            </p>

            {error && (
              <p className="text-xs mb-4" style={{ color: "var(--color-danger)" }}>
                {error}
              </p>
            )}

            <div className="flex gap-2.5">
              <button
                onClick={() => setStep("input")}
                disabled={submitting}
                className="btn btn-secondary flex-1"
              >
                Volver a editar
              </button>
              <button onClick={handleConfirm} disabled={submitting} className="btn btn-primary flex-1">
                {submitting ? "Guardando..." : "Confirmar"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
