export default function OvertimeBadge() {
  return (
    <span
      className="text-micro font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap"
      title="Tiene día libre programado -- solo se suma si el RL lo decide a mano"
      style={{
        color: "var(--color-warning)",
        backgroundColor: "color-mix(in srgb, var(--color-warning) 16%, transparent)",
      }}
    >
      OT
    </span>
  );
}
