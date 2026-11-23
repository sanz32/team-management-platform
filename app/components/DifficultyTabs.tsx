import { WISHLIST_DIFFICULTIES, WishlistDifficulty } from "@/lib/wishlist";

export default function DifficultyTabs({
  value,
  onChange,
}: {
  value: WishlistDifficulty;
  onChange: (next: WishlistDifficulty) => void;
}) {
  return (
    <div className="inline-flex rounded-lg p-1 gap-1" style={{ backgroundColor: "var(--color-surface-2)" }}>
      {WISHLIST_DIFFICULTIES.map((d) => {
        const active = d.key === value;
        return (
          <button
            key={d.key}
            type="button"
            onClick={() => onChange(d.key)}
            className="px-3 py-1.5 rounded-md text-sm font-semibold transition-colors"
            style={{
              background: active ? "linear-gradient(135deg, var(--color-primary), var(--color-primary-deep))" : "transparent",
              color: active ? "white" : "var(--color-ink-faint)",
            }}
          >
            {d.label}
          </button>
        );
      })}
    </div>
  );
}
