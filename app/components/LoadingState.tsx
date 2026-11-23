export default function LoadingState({
  variant = "rows",
  count = 5,
  className = "",
  gridClassName,
}: {
  variant?: "rows" | "cards" | "panel";
  count?: number;
  className?: string;
  gridClassName?: string;
}) {
  if (variant === "cards") {
    return (
      <div
        className={`${gridClassName ?? "grid gap-3"} ${className}`.trim()}
        style={
          gridClassName ? undefined : { gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }
        }
        aria-hidden
      >
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="skeleton-card">
            <div className="skeleton h-4 w-1/2" />
            <div className="skeleton h-3 w-2/3" />
            <div className="skeleton h-16 w-full" />
          </div>
        ))}
      </div>
    );
  }

  if (variant === "panel") {
    return (
      <div className={`skeleton-card ${className}`} aria-hidden>
        <div className="skeleton h-5 w-40" />
        <div className="skeleton h-3 w-64" />
        <div className="skeleton h-32 w-full" />
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-2 ${className}`} aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-xl px-4 py-3"
          style={{ border: "1px solid var(--color-line)", backgroundColor: "var(--color-surface)" }}
        >
          <div className="skeleton h-8 w-8 rounded-full shrink-0" />
          <div className="flex-1 min-w-0 flex flex-col gap-1.5">
            <div className="skeleton h-3.5" style={{ width: `${58 - i * 4}%` }} />
            <div className="skeleton h-2.5" style={{ width: `${38 - i * 3}%` }} />
          </div>
          <div className="skeleton h-3.5 w-16 shrink-0" />
        </div>
      ))}
    </div>
  );
}
