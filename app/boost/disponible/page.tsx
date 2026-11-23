import type { Metadata } from "next";
import { after } from "next/server";
import { getListedSlots, getSeasonShowcase } from "@/lib/boost-store";
import { issueFormToken } from "@/lib/boost-draft";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  canRequestRefresh,
  isRefreshPending,
  readRefreshSignal,
  requestRefresh,
} from "@/lib/boost-refresh-signal";
import RunsClient from "./RunsClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Available now" };

export default async function BoostRunsPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  const query = await searchParams;

  const supabase = createServerSupabaseClient();
  const [slots, signal, raids] = await Promise.all([
    getListedSlots().catch((err) => {
      console.error("No se pudieron cargar las runs disponibles:", err);
      return [] as Awaited<ReturnType<typeof getListedSlots>>;
    }),
    readRefreshSignal(supabase),
    getSeasonShowcase().catch(() => []),
  ]);

  const heroRaid = raids[0] ?? null;

  const yaPendiente = isRefreshPending(signal);
  const sePuedePedir = canRequestRefresh(signal);
  if (!yaPendiente && sePuedePedir) after(() => requestRefresh(supabase));

  return (
    <RunsClient
      slots={slots}
      heroRaid={heroRaid}
      refreshPending={yaPendiente || sePuedePedir}
      refSlug={query.ref ?? null}
      formToken={issueFormToken()}
    />
  );
}
