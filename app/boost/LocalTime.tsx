"use client";

import { useEffect, useState } from "react";

const PLACEHOLDER = "·····";

export default function LocalTime({
  iso,
  format,
  className,
}: {
  iso: string;
  format: (date: Date) => string;
  className?: string;
}) {
  const [montado, setMontado] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMontado(true);
  }, []);

  const date = new Date(iso);
  const texto = montado && !Number.isNaN(date.getTime()) ? format(date) : PLACEHOLDER;

  return (
    <span className={className} style={montado ? undefined : { minWidth: "11ch", display: "inline-block" }}>
      {texto}
    </span>
  );
}
