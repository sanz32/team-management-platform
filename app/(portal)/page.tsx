import { after } from "next/server";
import Link from "next/link";
import { auth } from "@/lib/auth";
import GoalsHero from "../components/dashboard/GoalsHero";
import PointsHero from "../components/dashboard/PointsHero";
import NextActivityCard from "../components/NextActivityCard";
import RecentActivityFeed from "../components/dashboard/RecentActivityFeed";
import RaidConsole from "../components/dashboard/RaidConsole";
import FriendRaidConsole from "../components/dashboard/FriendRaidConsole";
import FriendVideoPanel from "../components/dashboard/FriendVideoPanel";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getBalanceSummary, getBalanceHistory } from "@/lib/balance";
import { fetchAllBossKills } from "@/lib/boss-kills";
import { getCurrentLockoutWeek } from "@/lib/wow-reset";
import { getCurrentRaidCatalog } from "@/lib/raid-catalog";
import { TRACKED_LOCKOUT_DIFFICULTIES, type Difficulty } from "@/lib/raids";
import { getGoalTargets, countCharactersForGoal, computeAverageIlvl, ilvlGoalUsesMains, ilvlGoalTopN } from "@/lib/guild-goals";
import { closeElapsedGoalWeeksIfStale, getGoalDebtsForUser } from "@/lib/goal-history";
import { isGoalDebtSettled } from "@/lib/goal-progress";
import { getMainClassesForUser } from "@/lib/main-classes";
import { refreshWclLockoutsIfStale } from "@/lib/lockout-freshness";
import { refreshFriendLockoutsIfStale } from "@/lib/friend-lockout-freshness";
import { getLastClosedWeek } from "@/lib/weekly-earnings";
import { getCurrentAppUserId } from "@/lib/current-app-user";
import { getUserCurrentWeekPoints } from "@/lib/points";

export const metadata = { title: "Inicio" };

const WEEK_LABEL_FORMATTER = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});
const CLOSED_AT_FORMATTER = new Intl.DateTimeFormat("es-ES", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function computeUnsavedByRaid(
  characterRows: { id: string; region: string }[],
  kills: Awaited<ReturnType<typeof fetchAllBossKills>>,
  raidCatalog: Awaited<ReturnType<typeof getCurrentRaidCatalog>>
) {
  const unsavedCountForDifficulty = (raidKey: string, difficulty: Difficulty) =>
    characterRows.filter((c) => {
      const currentWeek = getCurrentLockoutWeek(c.region);
      const hasKill = kills.some(
        (k) =>
          k.character_id === c.id &&
          k.lockout_week === currentWeek &&
          k.boss_key.startsWith(`${raidKey}-${difficulty}-`)
      );
      return !hasKill;
    }).length;

  return raidCatalog.raids.map((raid) => ({
    key: raid.key,
    name: raid.name,
    abbr: raid.abbr,
    color: raid.color,
    headerImageUrl: raid.headerImageUrl,
    difficulties: raid.difficulties,
    counts: Object.fromEntries(
      TRACKED_LOCKOUT_DIFFICULTIES.filter((d) => raid.difficulties.includes(d)).map((d) => [
        d,
        unsavedCountForDifficulty(raid.key, d),
      ])
    ) as Partial<Record<Difficulty, number>>,
  }));
}

export default async function DashboardPage() {
  const session = await auth();
  const supabase = createServerSupabaseClient();
  const appRole = session?.user?.appRole;
  const nickname = session?.user?.nickname;
  const firstName = nickname || session?.user?.name?.split(" ")[0] || "";

  if (appRole === "friend") {
    const appUserId = await getCurrentAppUserId(supabase, session?.user);
    if (appUserId) after(() => refreshFriendLockoutsIfStale(supabase, appUserId));
    const [{ data: friendCharacters }, friendRaidCatalog] = await Promise.all([
      supabase.from("characters").select("id, region").eq("user_id", appUserId ?? ""),
      getCurrentRaidCatalog(supabase),
    ]);
    const friendCharacterRows = friendCharacters ?? [];
    const friendKills = await fetchAllBossKills(
      supabase,
      friendCharacterRows.map((c) => c.id)
    );

    return (
      <main className="portal-container py-10">
        <h1 className="text-display-xl text-ink mb-6">Hola, {firstName}</h1>
        <div className="flex flex-col gap-5">
          <FriendRaidConsole
            unsavedByRaid={computeUnsavedByRaid(friendCharacterRows, friendKills, friendRaidCatalog)}
          />
          <FriendVideoPanel videoUrl={process.env.FRIEND_DASHBOARD_VIDEO_URL ?? null} />
        </div>
      </main>
    );
  }

  const goalTargetsPromise = getGoalTargets(supabase);
  const lastClosedWeekPromise = getLastClosedWeek(supabase);
  const raidCatalogPromise = getCurrentRaidCatalog(supabase);

  const appUserId = await getCurrentAppUserId(supabase, session?.user);
  const userId = appUserId ?? "";

  after(() => refreshWclLockoutsIfStale(supabase));

  after(() => closeElapsedGoalWeeksIfStale(supabase));

  const balancePromise = appUserId ? getBalanceSummary(supabase, userId) : Promise.resolve(null);
  const balanceHistoryPromise = appUserId ? getBalanceHistory(supabase, userId) : Promise.resolve(null);
  const mainClassesPromise = appUserId
    ? getMainClassesForUser(supabase, userId)
    : Promise.resolve(new Set<string>());
  const goalDebtsPromise = appUserId
    ? getGoalDebtsForUser(supabase, userId)
    : Promise.resolve({ characters: null, avg_ilvl: null });
  const pointsPromise =
    appUserId && appRole !== "guest"
      ? getUserCurrentWeekPoints(supabase, userId)
      : Promise.resolve(null);

  const { data: characters } = await supabase
    .from("characters")
    .select("id, ilvl, region, class")
    .eq("user_id", userId);

  const characterRows = characters ?? [];

  const kills = await fetchAllBossKills(supabase, characterRows.map((c) => c.id));

  const [
    balance,
    balanceHistory,
    goalTargets,
    lastClosedWeek,
    mainClasses,
    raidCatalog,
    goalDebts,
    weekPoints,
  ] = await Promise.all([
    balancePromise,
    balanceHistoryPromise,
    goalTargetsPromise,
    lastClosedWeekPromise,
    mainClassesPromise,
    raidCatalogPromise,
    goalDebtsPromise,
    pointsPromise,
  ]);

  const unsavedByRaid = computeUnsavedByRaid(characterRows, kills, raidCatalog);

  const charGoal = goalTargets.find((g) => g.goalType === "characters");
  const currentByGoalType: Record<"characters" | "avg_ilvl", number> = {
    characters: countCharactersForGoal(characterRows, charGoal, mainClasses),
    avg_ilvl: computeAverageIlvl(
      characterRows,
      ilvlGoalUsesMains(goalTargets) ? mainClasses : undefined,
      ilvlGoalTopN(goalTargets)
    ),
  };
  const goals = goalTargets.map((g) => {
    const debt = goalDebts[g.goalType];
    const settled = debt ? isGoalDebtSettled(debt, characterRows, mainClasses) : true;
    return {
      goalType: g.goalType,
      current: currentByGoalType[g.goalType],
      target: g.target,
      debt: debt && !settled ? debt : null,
      deadlineOffsetMinutes: g.deadlineOffsetMinutes,
    };
  });

  const pendingTotal = balance?.total ?? 0;

  return (
    <main className="portal-container py-10">
      <div className="relative overflow-hidden pt-24 -mt-24">
        <div
          className="absolute -left-16 top-0 w-[380px] h-[380px] rounded-full pointer-events-none"
          style={{ background: "radial-gradient(circle, rgba(255, 125, 10, 0.08), transparent 70%)" }}
          aria-hidden
        />
        <div
          className="absolute left-28 top-4 w-[320px] h-[320px] rounded-full pointer-events-none"
          style={{ background: "radial-gradient(circle, rgba(168, 85, 247, 0.06), transparent 70%)" }}
          aria-hidden
        />
        <h1 className="text-display-xl text-ink mb-4 relative">Hola, {firstName}</h1>

        <div className="relative flex flex-wrap items-center justify-between gap-3 mb-6 pb-5 border-b border-line">
          <p className="text-ink-muted text-sm">
            {lastClosedWeek ? (
              <>
                Último cierre semanal:{" "}
                <span className="text-ink font-medium">
                  {WEEK_LABEL_FORMATTER.format(new Date(`${lastClosedWeek.weekStart}T00:00:00Z`))} al{" "}
                  {WEEK_LABEL_FORMATTER.format(new Date(`${lastClosedWeek.weekEnd}T00:00:00Z`))}
                </span>{" "}
                · cerrado el {CLOSED_AT_FORMATTER.format(new Date(lastClosedWeek.closedAt))}
              </>
            ) : (
              "Todavía no se cerró ninguna semana"
            )}
          </p>
          {(appRole === "admin" || appRole === "manager") && (
            <Link href="/resumen-semanal" className="btn btn-secondary !text-xs !py-1.5 !px-3">
              Cerrar semana
            </Link>
          )}
        </div>
      </div>

      <div className="flex flex-col lg:flex-row items-stretch gap-5 mb-5">
        <div className={weekPoints ? "lg:flex-[2] min-w-0" : "lg:flex-[3] min-w-0"}>
          <GoalsHero goals={goals} />
        </div>
        {weekPoints && (
          <div className="lg:shrink-0">
            <PointsHero
              totalPoints={weekPoints.totalPoints}
              totalPercentValue={weekPoints.totalPercentValue}
            />
          </div>
        )}
        <div className="lg:flex-1 min-w-0">
          <NextActivityCard canManage={appRole === "admin" || appRole === "manager"} />
        </div>
      </div>

      <div className="mb-5">
        <RaidConsole unsavedByRaid={unsavedByRaid} balanceTotal={pendingTotal} />
      </div>

      {balanceHistory && (
        <RecentActivityFeed
          history={balanceHistory}
          goldPerUsd={balance?.goldPerUsd ?? null}
          showObBalance={appRole !== "guest"}
        />
      )}
    </main>
  );
}
