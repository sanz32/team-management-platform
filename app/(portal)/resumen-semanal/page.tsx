import ResumenSemanalClient from "./ResumenSemanalClient";

export const metadata = { title: "Resumen Semanal" };

export default function ResumenSemanalPage() {
  return (
    <main className="portal-container py-10">
      <ResumenSemanalClient />
    </main>
  );
}
