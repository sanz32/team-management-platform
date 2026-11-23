import { signIn } from "@/lib/auth";

export const metadata = { title: "Login de prueba" };

export default function DevLoginPage() {
  if (process.env.NODE_ENV === "production") {
    return (
      <main className="max-w-md mx-auto px-6 py-16 text-center">
        <p className="text-ink-muted">No disponible.</p>
      </main>
    );
  }

  return (
    <main className="max-w-md mx-auto px-6 py-16 text-center">
      <h1 className="text-display-lg text-ink mb-2">Login de prueba</h1>
      <p className="text-ink-muted text-sm mb-6">
        Solo para desarrollo local. Entra como un usuario de prueba fijo, sin tocar Discord. Elige
        con qué rol quieres ver el portal.
      </p>
      <div className="flex flex-col gap-3">
        <form
          action={async () => {
            "use server";
            await signIn("dev-test-login", { redirectTo: "/" });
          }}
        >
          <button type="submit" className="btn btn-primary w-full">
            Entrar como Admin
          </button>
        </form>
        <form
          action={async () => {
            "use server";
            await signIn("dev-friend-login", { redirectTo: "/" });
          }}
        >
          <button type="submit" className="btn btn-secondary w-full">
            Entrar como Compañeros
          </button>
        </form>
      </div>
    </main>
  );
}
