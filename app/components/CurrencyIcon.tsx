"use client";

export default function CurrencyIcon({
  url,
  name,
  size = 20,
}: {
  url: string | null;
  name: string | null;
  size?: number;
}) {
  const style: React.CSSProperties = {
    width: size,
    height: size,
    border: "1px solid var(--color-line)",
  };
  if (!url) {
    return (
      <span
        className="shrink-0 rounded"
        style={{ ...style, backgroundColor: "var(--color-surface-2)" }}
        aria-hidden
      />
    );
  }
  return (
    <span
      className="shrink-0 rounded bg-cover bg-center"
      style={{ ...style, backgroundImage: `url(${url})` }}
      title={name ?? undefined}
      aria-hidden
    />
  );
}
