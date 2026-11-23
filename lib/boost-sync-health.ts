export const SYNC_STALE_MINUTES = 6;

export const SYNC_PAUSE_HOURS: [number, number] = [3, 9];

export type BoostSyncState =
  | "vivo"
  | "dormido"
  | "caido"
  | "desconocido";

export interface BoostSyncHealth {
  state: BoostSyncState;
  minutesSinceSync: number | null;
}

export function boostSyncHealth(
  signal: { syncedAt?: string | null } | null,
  now: Date,
  guildHour: number
): BoostSyncHealth {
  const syncedAt = signal?.syncedAt ? new Date(signal.syncedAt).getTime() : NaN;
  if (!Number.isFinite(syncedAt)) return { state: "desconocido", minutesSinceSync: null };

  const minutos = Math.max(0, Math.floor((now.getTime() - syncedAt) / 60_000));
  if (minutos < SYNC_STALE_MINUTES) return { state: "vivo", minutesSinceSync: minutos };

  const [desde, hasta] = SYNC_PAUSE_HOURS;
  const enPausa = guildHour >= desde && guildHour < hasta;
  return { state: enPausa ? "dormido" : "caido", minutesSinceSync: minutos };
}

export function formatSinceSync(minutes: number | null): string {
  if (minutes == null) return "nunca";
  if (minutes < 1) return "hace menos de un minuto";
  if (minutes < 60) return `hace ${minutes} min`;
  const horas = Math.floor(minutes / 60);
  if (horas < 24) {
    const resto = minutes % 60;
    return resto === 0 ? `hace ${horas} h` : `hace ${horas} h ${resto} min`;
  }
  const dias = Math.floor(horas / 24);
  return dias === 1 ? "hace 1 día" : `hace ${dias} días`;
}
