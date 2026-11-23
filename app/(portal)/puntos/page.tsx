import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import PuntosClient from "./PuntosClient";

export const metadata = { title: "Puntos" };

export default async function PuntosPage() {
  const session = await auth();
  const appRole = session?.user?.appRole;

  if (appRole === "guest" || appRole === "friend") redirect("/");

  return <PuntosClient canManage={appRole === "admin" || appRole === "manager"} />;
}
