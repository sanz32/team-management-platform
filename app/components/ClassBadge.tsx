import { classColor, shortSpec } from "@/lib/wow-classes";

export default function ClassBadge({
  wowClass,
  spec,
}: {
  wowClass: string | null | undefined;
  spec?: string | null;
}) {
  if (!wowClass) {
    return <span className="text-ink-faint text-xs">-</span>;
  }

  const color = classColor(wowClass);

  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap"
      style={{
        color,
        backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 40%, transparent)`,
      }}
    >
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
      {shortSpec(wowClass, spec)}
    </span>
  );
}
