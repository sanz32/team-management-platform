import ConectarAppClient from "./ConectarAppClient";

export const metadata = { title: "Vincular la app" };

export default async function ConectarAppPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const params = await searchParams;
  const deviceCode = params?.code ?? null;

  return (
    <main className="max-w-xl mx-auto px-4 sm:px-6 py-16">
      <ConectarAppClient deviceCode={deviceCode} />
    </main>
  );
}
