import { auth } from "@/lib/auth";
import NavBar from "../components/NavBar";
import CacheScope from "../components/CacheScope";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const ownerId = session?.user?.appUserId ?? session?.user?.discordId ?? null;

  return (
    <div className="flex min-h-screen flex-col">
      <CacheScope ownerId={ownerId} />
      <NavBar />
      <div className="flex-1">{children}</div>
      <footer className="border-t border-line">
        <div className="portal-container is-wide py-6 text-center text-xs text-ink-muted">
          © 2026 Team Portal
        </div>
      </footer>
    </div>
  );
}
