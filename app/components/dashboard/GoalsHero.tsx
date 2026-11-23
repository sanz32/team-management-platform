import { Users, Gauge, Target } from "lucide-react";
import IconBadge from "./IconBadge";
import GradientBorderCard from "./GradientBorderCard";
import GoalDebtBadge from "../GoalDebtBadge";
import GoalDeadlineNote from "../GoalDeadlineNote";
import { MINUTES_PER_WEEK, type GoalDebt } from "@/lib/goal-progress";

export interface GuildGoalDisplay {
  goalType: "characters" | "avg_ilvl";
  current: number;
  target: number;
  debt?: GoalDebt | null;
  deadlineOffsetMinutes?: number | null;
}

function soonestDeadlineOffset(goals: GuildGoalDisplay[]): number | null {
  let soonest: number | null = null;
  for (const goal of goals) {
    const offset = goal.deadlineOffsetMinutes ?? MINUTES_PER_WEEK;
    if (soonest === null || offset < soonest) soonest = offset;
  }
  return soonest === MINUTES_PER_WEEK ? null : soonest;
}

interface GoalsHeroProps {
  goals: GuildGoalDisplay[];
}

const GOAL_META: Record<GuildGoalDisplay["goalType"], { label: string; icon: typeof Users; color: string }> = {
  characters: { label: "Personajes", icon: Users, color: "var(--color-secondary)" },
  avg_ilvl: { label: "ilvl promedio", icon: Gauge, color: "var(--color-epic)" },
};

function GoalRow({ goal }: { goal: GuildGoalDisplay }) {
  const meta = GOAL_META[goal.goalType];
  const pct = goal.target > 0 ? Math.min(100, Math.round((goal.current / goal.target) * 100)) : 0;
  const reached = goal.current >= goal.target;
  return (
    <div className="flex items-center gap-4">
      <IconBadge icon={meta.icon} color={meta.color} size="lg" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="flex items-center gap-2 min-w-0">
            <p className="text-caption !text-ink-faint truncate">{meta.label}</p>
            <GoalDebtBadge debt={goal.debt ?? null} current={goal.current} />
          </span>
          <span
            className="font-data text-lg font-bold"
            style={{ color: reached ? "var(--color-success)" : "var(--color-ink)" }}
          >
            {goal.current}/{goal.target}
          </span>
        </div>
        <div className="h-2 rounded-full overflow-hidden mt-2" style={{ backgroundColor: "var(--color-surface-2)" }}>
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${pct}%`,
              background: reached
                ? "var(--color-success)"
                : `linear-gradient(90deg, ${meta.color}, var(--color-primary))`,
            }}
          />
        </div>
      </div>
    </div>
  );
}

export default function GoalsHero({ goals }: GoalsHeroProps) {
  return (
    <GradientBorderCard className="card hero-glow p-7 sm:p-8 h-full flex flex-col">
      <div className="flex items-center gap-2.5 mb-6">
        <IconBadge icon={Target} color="var(--color-gold)" />
        <p className="text-caption">Objetivos</p>
      </div>

      {goals.length > 0 ? (
        <>
          <div className="flex flex-col gap-8 flex-1 justify-center">
            {goals.map((goal) => (
              <GoalRow key={goal.goalType} goal={goal} />
            ))}
          </div>
          <div className="mt-6 pt-4 border-t border-line">
            <GoalDeadlineNote offsetMinutes={soonestDeadlineOffset(goals)} />
          </div>
        </>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-ink-faint text-sm text-center">
            El líder todavía no configuró objetivos para el guild.
          </p>
        </div>
      )}
    </GradientBorderCard>
  );
}
