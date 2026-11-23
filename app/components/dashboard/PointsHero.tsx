import Link from "next/link";
import { Gavel, ArrowRight } from "lucide-react";
import IconBadge from "./IconBadge";
import GradientBorderCard from "./GradientBorderCard";
import PointStamp, { formatDiscount, POINT_COLOR, pointsLabel } from "../PointStamp";

export default function PointsHero({
  totalPoints,
  totalPercentValue,
}: {
  totalPoints: number;
  totalPercentValue: number;
}) {
  const clean = totalPoints === 0;

  return (
    <GradientBorderCard
      className="card hero-glow p-7 sm:p-8 h-full flex flex-col"
      gradient={`linear-gradient(90deg, ${POINT_COLOR}, var(--color-epic))`}
      style={{ "--hero-glow-tint": "rgba(250, 204, 21, 0.11)" } as React.CSSProperties}
    >
      <div className="flex items-center gap-2.5 mb-6">
        <IconBadge icon={Gavel} color={POINT_COLOR} />
        <p className="text-caption">Puntos de la semana</p>
      </div>

      <div className="flex-1 flex items-center gap-6">
        <PointStamp points={totalPoints} size="xl" />
        <div>
          {clean ? (
            <>
              <p className="text-caption !text-ink-faint mb-2" style={{ fontSize: "0.85rem" }}>
                Sin anotaciones
              </p>
              <p
                className="font-heading font-bold"
                style={{ color: "var(--color-success)", fontSize: "2.75rem", lineHeight: 1.1, letterSpacing: "-0.02em" }}
              >
                Semana limpia
              </p>
              <p className="text-ink-muted mt-2" style={{ fontSize: "1rem" }}>
                No hay descuentos que aplicar
              </p>
            </>
          ) : (
            <>
              <p className="text-caption !text-ink-faint mb-2" style={{ fontSize: "0.85rem" }}>
                Descuento acumulado
              </p>
              <p
                className="font-heading font-bold tabular-nums"
                style={{ color: POINT_COLOR, fontSize: "3.5rem", lineHeight: 1.05, letterSpacing: "-0.02em" }}
              >
                {formatDiscount(totalPercentValue)}
              </p>
              <p className="text-ink-muted mt-2" style={{ fontSize: "1rem" }}>
                {totalPoints} {pointsLabel(totalPoints)} {totalPoints === 1 ? "anotado" : "anotados"}
              </p>
            </>
          )}
        </div>
      </div>

      <Link
        href="/puntos"
        prefetch={false}
        className="inline-flex items-center gap-1 text-xs font-semibold w-fit mt-6 text-ink-faint hover:text-ink transition-colors"
      >
        Ver el detalle
        <ArrowRight className="w-3 h-3" />
      </Link>
    </GradientBorderCard>
  );
}
