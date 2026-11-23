import Link from "next/link";

interface EmptyStateProps {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  message: string;
  description?: string;
  cta?: { label: string; href: string };
  compact?: boolean;
}

export default function EmptyState({ icon: Icon, message, description, cta, compact = false }: EmptyStateProps) {
  if (compact) {
    return (
      <div className="flex items-center gap-2 text-ink-faint">
        <Icon className="w-4 h-4 shrink-0" />
        <span className="text-sm">{message}</span>
        {cta && (
          <Link href={cta.href} className="text-xs font-semibold ml-1 shrink-0" style={{ color: "var(--color-primary)" }}>
            {cta.label}
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center text-center py-10 gap-3.5">
      <span className="relative shrink-0 flex items-center justify-center">
        <span
          className="w-12 h-12 rounded-lg flex items-center justify-center"
          style={{
            backgroundColor: "var(--color-surface-2)",
            border: "1px solid var(--color-line-strong)",
          }}
        >
          <Icon className="w-5 h-5" style={{ color: "var(--color-ink-faint)" }} />
        </span>
        <span
          className="absolute -top-px -left-px w-2.5 h-2.5 rounded-tl-lg pointer-events-none"
          style={{
            borderTop: "2px solid var(--color-primary)",
            borderLeft: "2px solid var(--color-primary)",
          }}
          aria-hidden
        />
        <span
          className="absolute -bottom-px -right-px w-2.5 h-2.5 rounded-br-lg pointer-events-none"
          style={{
            borderBottom: "2px solid var(--color-primary)",
            borderRight: "2px solid var(--color-primary)",
          }}
          aria-hidden
        />
      </span>
      <div>
        <p className="text-sm text-ink font-semibold">{message}</p>
        {description && (
          <p className="text-label text-ink-faint mt-1.5 max-w-[34ch] mx-auto leading-relaxed">
            {description}
          </p>
        )}
      </div>
      {cta && (
        <Link href={cta.href} className="btn btn-secondary !text-label !py-1.5 !px-3 mt-1">
          {cta.label}
        </Link>
      )}
    </div>
  );
}
