import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import NicknameSetupClient from "./NicknameSetupClient";

export const metadata = { title: "Elegir nickname" };

export default async function NicknameOnboardingPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const nickname = session.user.nickname;
  if (nickname) {
    redirect("/");
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <NicknameSetupClient />
    </div>
  );
}
