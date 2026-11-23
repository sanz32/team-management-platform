import { auth } from "@/lib/auth";
import { isAppDownloadAvailable } from "@/lib/app-download";
import AppSyncClient from "./AppSyncClient";

export const metadata = { title: "App / Addon" };

export default async function AppPage() {
  const session = await auth();
  const isAdmin = session?.user?.appRole === "admin";

  const downloadAvailable = isAppDownloadAvailable();

  return (
    <main className="portal-container py-10">
      <AppSyncClient isAdmin={isAdmin} downloadAvailable={downloadAvailable} />
    </main>
  );
}
