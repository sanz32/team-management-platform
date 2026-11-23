import { CalendarX } from "lucide-react";
import {
  describeGoalRules,
  goalDebtSeverity,
  GOAL_TYPE_LABELS,
  type GoalDebt,
  type GoalDebtSeverity,
} from "@/lib/goal-progress";

interface SeverityStyle {
  fg: string;
  bgMix: number;
  borderMix: number;
}

const SEVERITY_STYLES: Record<Exclude<GoalDebtSeverity, "none">, SeverityStyle> = {
  leve: { fg: "var(--color-warning)", bgMix: 14, borderMix: 38 },
  medio: { fg: "var(--color-alert)", bgMix: 18, borderMix: 55 },
  grave: { fg: "var(--color-danger)", bgMix: 22, borderMix: 68 },
};

const SIZE_CONFIG = {
  sm: { wrapper: "h-[18px] px-1.5 gap-1 text-micro", icon: "w-3 h-3", showUnit: false },
  md: { wrapper: "h-6 px-2 gap-1.5 text-xs", icon: "w-3.5 h-3.5", showUnit: true },
} as const;

export function goalDebtTooltip(debt: GoalDebt, current?: number): string {
  const semanas = debt.weeks === 1 ? "1 semana" : `${debt.weeks} semanas`;
  const objetivo = GOAL_TYPE_LABELS[debt.goalType];
  const marcador = current != null ? ` (va en ${current})` : "";
  return [
    `${semanas} sin cumplir el objetivo de ${objetivo}${marcador}.`,
    `Le faltó: ${describeGoalRules(debt.goalType, debt)}.`,
    "La marca se apaga sola en cuanto lo alcance.",
  ].join(" ");
}

export default function GoalDebtBadge({
  debt,
  size = "sm",
  current,
}: {
  debt: GoalDebt | null;
  size?: keyof typeof SIZE_CONFIG;
  current?: number;
}) {
  const severity = goalDebtSeverity(debt?.weeks ?? 0);
  if (!debt || severity === "none") return null;

  const style = SEVERITY_STYLES[severity];
  const config = SIZE_CONFIG[size];

  return (
    <span
      title={goalDebtTooltip(debt, current)}
      className={`shrink-0 inline-flex items-center rounded-full font-data font-bold leading-none ${config.wrapper} ${
        severity === "grave" ? "goal-streak-grave" : ""
      }`}
      style={{
        color: style.fg,
        backgroundColor: `color-mix(in srgb, ${style.fg} ${style.bgMix}%, transparent)`,
        border: `1px solid color-mix(in srgb, ${style.fg} ${style.borderMix}%, transparent)`,
      }}
    >
      <CalendarX className={config.icon} />
      {debt.weeks}
      {config.showUnit && <span className="font-normal opacity-70">sem</span>}
    </span>
  );
}
