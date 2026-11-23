export default function PillToggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex items-center gap-2.5 text-sm text-ink cursor-pointer select-none w-fit">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 ease-out"
        style={{ backgroundColor: checked ? "var(--color-success)" : "var(--color-line-strong)" }}
      >
        <span
          className="inline-block h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ease-out"
          style={{ transform: `translateX(${checked ? 22 : 3}px)` }}
        />
      </button>
      {label}
    </label>
  );
}
