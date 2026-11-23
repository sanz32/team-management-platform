export default function IconBadge({
  icon: Icon,
  color,
  size = "md",
}: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  color: string;
  size?: "sm" | "md" | "lg";
}) {
  const box = size === "lg" ? "w-11 h-11" : size === "sm" ? "w-7 h-7" : "w-9 h-9";
  const iconSize = size === "lg" ? "w-5 h-5" : size === "sm" ? "w-3.5 h-3.5" : "w-4 h-4";

  return (
    <span
      className={`${box} rounded-lg flex items-center justify-center shrink-0`}
      style={{
        backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 35%, transparent)`,
      }}
    >
      <Icon className={iconSize} style={{ color }} />
    </span>
  );
}
