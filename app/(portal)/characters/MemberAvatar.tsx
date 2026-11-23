import type { CSSProperties } from "react";

const MEMBER_ACCENTS = [
  "var(--color-primary)",
  "var(--color-secondary)",
  "var(--color-success)",
  "var(--color-epic)",
  "var(--color-warning)",
];

export interface AvatarMember {
  user_id: string;
  discord_username: string;
  avatar_url: string | null;
}

export function memberAccent(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = (hash * 31 + userId.charCodeAt(i)) | 0;
  return MEMBER_ACCENTS[Math.abs(hash) % MEMBER_ACCENTS.length];
}

function AppLogoMark() {
  return (
    <svg viewBox="0 0 100 100" role="presentation">
      <rect width="100" height="100" rx="22" fill="#06060c" />
      <g stroke="#a855f7" strokeWidth="10" strokeLinecap="round" fill="none">
        <path d="M50,50 L50.5,25" transform="rotate(0 50 50)" />
<circle cx="50" cy="22" r="6" transform="rotate(0 50 50)" />
        <path d="M50,50 L50.5,25" transform="rotate(120 50 50)" />
<circle cx="50" cy="22" r="6" transform="rotate(120 50 50)" />
        <path d="M50,50 L50.5,25" transform="rotate(240 50 50)" />
<circle cx="50" cy="22" r="6" transform="rotate(240 50 50)" />
      </g>
      <circle cx="50" cy="50" r="13" fill="#f7f5fb" />
    </svg>
  );
}

function frameColorVars(
  accent1: string | null | undefined,
  accent2: string | null | undefined
): CSSProperties | undefined {
  if (!accent1 || !accent2) return undefined;
  return { "--mf-accent": accent1, "--mf-accent-2": accent2 } as CSSProperties;
}

export type FrameNameStyle = "gradient" | "solid" | "none";

export function memberNameProps(
  hasApp: boolean,
  nameStyle: FrameNameStyle | null | undefined,
  accent1: string | null | undefined,
  accent2: string | null | undefined
): { className: string; style?: CSSProperties } | null {
  if (!hasApp) return null;
  const effective = nameStyle ?? "gradient";
  if (effective === "none") return null;
  return {
    className: effective === "solid" ? "mf-name-solid" : "mf-name-glow",
    style: frameColorVars(accent1, accent2),
  };
}

export default function MemberAvatar({
  group,
  size,
  hasApp = false,
  accent1 = null,
  accent2 = null,
}: {
  group: AvatarMember;
  size: number;
  hasApp?: boolean;
  accent1?: string | null;
  accent2?: string | null;
}) {
  const accent = memberAccent(group.user_id);
  const initial = group.discord_username.charAt(0).toUpperCase();

  if (!hasApp) {
    return (
      <span
        className="shrink-0 rounded-full bg-cover bg-center inline-flex items-center justify-center font-heading font-bold"
        style={{
          width: size,
          height: size,
          fontSize: Math.round(size * 0.42),
          color: accent,
          backgroundColor: "var(--color-surface-2)",
          backgroundImage: group.avatar_url ? `url(${group.avatar_url})` : undefined,
          border: `1px solid color-mix(in srgb, ${accent} 45%, transparent)`,
        }}
        aria-hidden
      >
        {!group.avatar_url && initial}
      </span>
    );
  }

  return (
    <span
      className="mf"
      style={{ "--mf-size": `${size}px`, ...frameColorVars(accent1, accent2) } as CSSProperties}
      title="App Instalada"
      aria-label={`${group.discord_username}, App Instalada`}
    >
      <span className="mf__halo" aria-hidden />
      <span className="mf__ring" aria-hidden />
      <span className="mf__gap" aria-hidden />
      <span
        className="mf__img bg-cover bg-center inline-flex items-center justify-center font-heading font-bold"
        style={{
          fontSize: Math.round(size * 0.36),
          color: accent,
          backgroundColor: "var(--color-surface-2)",
          backgroundImage: group.avatar_url ? `url(${group.avatar_url})` : undefined,
        }}
        aria-hidden
      >
        {!group.avatar_url && initial}
      </span>
      <span className="mf__badge" aria-hidden>
        <AppLogoMark />
      </span>
    </span>
  );
}
