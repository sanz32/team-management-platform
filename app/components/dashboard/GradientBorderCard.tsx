interface GradientBorderCardProps {
  className?: string;
  style?: React.CSSProperties;
  gradient?: string;
  children: React.ReactNode;
}

const DEFAULT_GRADIENT = "linear-gradient(90deg, var(--color-gold), var(--color-epic))";

export default function GradientBorderCard({
  className = "",
  style,
  gradient = DEFAULT_GRADIENT,
  children,
}: GradientBorderCardProps) {
  return (
    <div className={`relative ${className}`} style={style}>
      <div
        className="absolute top-0 left-0 right-0 h-[3px] rounded-t-[1rem]"
        style={{ background: gradient }}
        aria-hidden
      />
      {children}
    </div>
  );
}
