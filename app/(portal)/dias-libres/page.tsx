import DiasLibresClient from "./DiasLibresClient";

export const metadata = { title: "Días Libres" };

export default async function DiasLibresPage({
  searchParams,
}: {
  searchParams: Promise<{ member?: string; panel?: string }>;
}) {
  const { member, panel } = await searchParams;

  return (
    <main className="portal-container py-10">
      <DiasLibresClient initialMemberId={member} initialPanel={panel} />
    </main>
  );
}
