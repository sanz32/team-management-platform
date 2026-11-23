export default function IconAction({
  icon: Icon,
  label,
  onClick,
  className = "",
  disabled = false,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`p-1.5 rounded-md text-ink-faint transition-colors hover:bg-[color:var(--color-surface-2)] disabled:opacity-50 ${className}`}
    >
      <Icon className="w-4 h-4" />
    </button>
  );
}
