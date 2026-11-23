import { auth } from "@/lib/auth";
import CharactersClient from "./CharactersClient";

export const metadata = { title: "Personajes" };

export default async function CharactersPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; member?: string }>;
}) {
  const session = await auth();
  const appRole = session?.user?.appRole;
  const canSeeAll =
    appRole === "admin" || appRole === "manager" || appRole === "guest" || appRole === "member";
  const canManage = appRole === "admin" || appRole === "manager";
  const { view, member } = await searchParams;

  return (
    <main className="portal-container is-wide py-10">
      <CharactersClient
        key={member ?? "sin-miembro"}
        canSeeAll={canSeeAll}
        canManage={canManage}
        initialViewMode={view === "admin" ? "admin" : "personal"}
        initialMemberId={member ?? null}
      />
    </main>
  );
}
