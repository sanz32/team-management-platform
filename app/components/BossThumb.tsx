export default function BossThumb({
  imageUrl,
  width = 52,
  height = 26,
}: {
  imageUrl: string | null;
  width?: number;
  height?: number;
}) {
  if (!imageUrl) {
    return <div className="rounded-md shrink-0" style={{ width, height, backgroundColor: "var(--color-surface-2)" }} />;
  }
  return (
    <div
      className="rounded-md shrink-0 overflow-hidden flex items-center justify-center"
      style={{ width, height, backgroundColor: "var(--color-surface-2)" }}
    >
      <img src={imageUrl} alt="" className="w-full h-full object-contain" />
    </div>
  );
}
