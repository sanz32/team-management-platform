import { createServerSupabaseClient } from "@/lib/supabase-server";
import { PUBLIC_BOOKING_COLUMNS, toPublicBooking } from "@/lib/boost-store";
import BoostStatusClient from "./BoostStatusClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your request" };

export default async function BoostStatusPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ nuevo?: string }>;
}) {
  const [{ token }, query] = await Promise.all([params, searchParams]);

  const supabase = createServerSupabaseClient();
  const { data } = await supabase
    .from("boost_bookings")
    .select(PUBLIC_BOOKING_COLUMNS)
    .eq("status_token", token)
    .maybeSingle();

  return (
    <BoostStatusClient
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      booking={data ? toPublicBooking(data as any) : null}
      justCreated={query.nuevo === "1"}
    />
  );
}
