"use client";

import { useMemo, useState } from "react";
import { RefreshCw, Sparkles } from "lucide-react";
import type { EquippedItem, CharacterStats } from "@/lib/blizzard";
import { qualityColor } from "@/lib/item-quality";
import { cascadeStyle } from "@/lib/cascade";
import { readJsonBody } from "@/lib/read-json";
import { invalidateCache } from "@/lib/data-cache";

interface ArmoryPanelProps {
  characterId: string;
  classColor: string;
  initialEquipmentFound: boolean;
  initialItems: EquippedItem[];
  initialStats: CharacterStats;
  initialRenderUrl: string | null;
  initialRace: string | null;
  initialGender: string | null;
  initialUpdatedAt: string | null;
  initialError: string;
}

const LARGE_MALE_RACES = new Set(["Tauren", "Highmountain Tauren"]);

function renderTransform(race: string | null, gender: string | null): string {
  const isLargeRace = gender === "Male" && !!race && LARGE_MALE_RACES.has(race);
  return isLargeRace ? "scale(1.15) translate(6%, -3%)" : "scale(1.45) translate(6%, -3%)";
}

function wowheadItemParams(item: EquippedItem): string {
  const bonusParam = item.bonusList.length > 0 ? `&bonus=${item.bonusList.join(":")}` : "";
  const gemsParam = item.gems.length > 0 ? `&gems=${item.gems.map((g) => g.itemId).join(",")}` : "";
  const permanentEnchant = item.enchants.find((e) => e.slotType === "PERMANENT");
  const enchParam = permanentEnchant ? `&ench=${permanentEnchant.enchantmentId}` : "";
  return `item=${item.itemId}${bonusParam}${gemsParam}${enchParam}`;
}

function wowheadGemParams(gem: EquippedItem["gems"][number]): string {
  return `item=${gem.itemId}`;
}

function wowheadEnchantSourceParams(enchant: EquippedItem["enchants"][number]): string | null {
  return enchant.sourceItemId != null ? `item=${enchant.sourceItemId}` : null;
}

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return "recién";
  if (diffMin < 60) return `hace ${diffMin} min`;
  const diffHours = Math.round(diffMin / 60);
  if (diffHours < 24) return `hace ${diffHours} h`;
  const diffDays = Math.round(diffHours / 24);
  return `hace ${diffDays} d`;
}

const LEFT_SLOTS = ["HEAD", "NECK", "SHOULDER", "BACK", "CHEST", "SHIRT", "TABARD", "WRIST"];
const RIGHT_SLOTS = ["HANDS", "WAIST", "LEGS", "FEET", "FINGER_1", "FINGER_2", "TRINKET_1", "TRINKET_2"];

type Side = "left" | "right";

function SlotRow({ item, side }: { item?: EquippedItem; side: Side }) {
  const hasItem = !!item?.itemId;

  const icon = (
    <div
      className="w-11 h-11 rounded-md shrink-0 overflow-hidden"
      style={{
        backgroundColor: hasItem ? "var(--color-line)" : "var(--color-surface-2)",
        border: hasItem ? `2px solid ${qualityColor(item!.quality)}` : "1px dashed var(--color-line-strong)",
      }}
    >
      {hasItem && item!.iconUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item!.iconUrl} alt={item!.name} className="w-full h-full object-cover" />
      )}
    </div>
  );

  if (!hasItem) {
    return <div className="flex">{icon}</div>;
  }

  const nameEl = (
    <span
      className="text-label leading-tight line-clamp-2 max-w-[170px]"
      style={{ color: qualityColor(item!.quality) }}
    >
      {item!.name}
    </span>
  );
  const ilvlEl = (
    <span className="text-label font-bold" style={{ color: "var(--color-gold)" }}>
      {item!.ilvl}
    </span>
  );

  const label = (
    <div className={`flex flex-col ${side === "left" ? "items-end text-right" : "items-start text-left"}`}>
      {nameEl}
      {ilvlEl}
    </div>
  );

  return (
    <a
      href={`https://www.wowhead.com/${wowheadItemParams(item!)}`}
      data-wowhead={wowheadItemParams(item!)}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-1.5 hover:opacity-90 transition-opacity"
    >
      {side === "left" ? (
        <>
          {label}
          {icon}
        </>
      ) : (
        <>
          {icon}
          {label}
        </>
      )}
    </a>
  );
}

export default function ArmoryPanel({
  characterId,
  classColor,
  initialEquipmentFound,
  initialItems,
  initialStats,
  initialRenderUrl,
  initialRace,
  initialGender,
  initialUpdatedAt,
  initialError,
}: ArmoryPanelProps) {
  const [equipmentFound, setEquipmentFound] = useState(initialEquipmentFound);
  const [items, setItems] = useState(initialItems);
  const [stats, setStats] = useState(initialStats);
  const [renderUrl, setRenderUrl] = useState(initialRenderUrl);
  const [race, setRace] = useState(initialRace);
  const [gender, setGender] = useState(initialGender);
  const [updatedAt, setUpdatedAt] = useState(initialUpdatedAt);
  const [error, setError] = useState(initialError);
  const [refreshing, setRefreshing] = useState(false);

  async function handleRefresh() {
    setRefreshing(true);
    setError("");
    try {
      const res = await fetch(`/api/characters/${characterId}/armory`, { method: "POST" });
      const data = await readJsonBody(res);
      if (!res.ok) {
        setError(data.error || "No se pudo actualizar el Armory ahora mismo.");
        return;
      }
      setEquipmentFound(data.equipmentFound);
      setItems(data.items ?? []);
      setStats(data.stats);
      setRenderUrl(data.renderUrl ?? null);
      setRace(data.race ?? null);
      setGender(data.gender ?? null);
      setUpdatedAt(data.updatedAt);
      invalidateCache("/api/lockouts");
    } catch {
      setError("No se pudo actualizar el Armory ahora mismo.");
    } finally {
      setRefreshing(false);
    }
  }

  const itemsBySlot = useMemo(() => {
    const map = new Map<string, EquippedItem>();
    for (const item of items) map.set(item.slotType, item);
    return map;
  }, [items]);

  const equippedGems = useMemo(
    () => items.flatMap((item) => item.gems.map((gem) => ({ gem, itemName: item.name }))),
    [items]
  );

  const equippedEnchants = useMemo(
    () => items.flatMap((item) => item.enchants.map((enchant) => ({ enchant, itemName: item.name }))),
    [items]
  );

  const primaryStats = [
    { label: "Fuerza", value: stats?.strength },
    { label: "Agilidad", value: stats?.agility },
    { label: "Intelecto", value: stats?.intellect },
    { label: "Aguante", value: stats?.stamina },
  ].filter((s) => s.value != null && s.value > 0);

  const secondaryStats = [
    { label: "Crítico", value: stats?.critPct },
    { label: "Celeridad", value: stats?.hastePct },
    { label: "Maestría", value: stats?.masteryPct },
    { label: "Versatilidad", value: stats?.versatilityPct },
  ];

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4">
        <p className="text-xs text-ink-faint">
          {updatedAt ? `Equipo actualizado ${formatRelativeTime(updatedAt)}` : "Todavía no se actualizó"}
        </p>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
          className="btn btn-secondary !py-1.5 !px-3 text-xs"
          title="Vuelve a pedir el equipo y las estadísticas a Blizzard ahora mismo"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? "Actualizando..." : "Actualizar"}
        </button>
      </div>

      {error && (
        <div
          className="text-sm rounded-xl p-4 mb-6"
          style={{
            backgroundColor: "color-mix(in srgb, var(--color-danger) 12%, transparent)",
            border: "1px solid color-mix(in srgb, var(--color-danger) 35%, transparent)",
            color: "var(--color-danger)",
          }}
        >
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-5">
        <div className="card p-5">
          <h2 className="font-heading text-lg font-bold text-ink mb-4">Estadísticas</h2>
          {!stats?.found ? (
            <p className="text-ink-faint text-sm">No hay estadísticas disponibles.</p>
          ) : (
            <div className="space-y-3">
              {primaryStats.length > 0 && (
                <div className="grid grid-cols-2 gap-2.5">
                  {primaryStats.map((s, index) => (
                    <div
                      key={s.label}
                      className="rounded-lg p-2.5 cascade-item"
                      style={{ backgroundColor: "var(--color-surface-2)", ...cascadeStyle(index) }}
                    >
                      <p className="text-ink-faint text-micro uppercase tracking-wide font-semibold truncate">
                        {s.label}
                      </p>
                      <p className="font-heading text-lg font-bold text-ink mt-0.5">
                        {s.value?.toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-2 gap-2.5">
                {secondaryStats.map((s, index) => (
                  <div
                    key={s.label}
                    className="rounded-lg p-2.5 cascade-item"
                    style={{ backgroundColor: "var(--color-surface-2)", ...cascadeStyle(index) }}
                  >
                    <p className="text-ink-faint text-micro uppercase tracking-wide font-semibold truncate">
                      {s.label}
                    </p>
                    <p className="font-heading text-lg font-bold text-ink mt-0.5">
                      {s.value != null ? `${s.value.toFixed(2)}%` : "-"}
                    </p>
                  </div>
                ))}
              </div>
              {stats.health && (
                <div className="rounded-lg p-2.5" style={{ backgroundColor: "var(--color-surface-2)" }}>
                  <p className="text-ink-faint text-micro uppercase tracking-wide font-semibold">Vida</p>
                  <p className="font-heading text-lg font-bold text-ink mt-0.5">
                    {stats.health.toLocaleString()}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="card p-6">
          <h2 className="font-heading text-lg font-bold text-ink mb-4">Equipo</h2>
          {!equipmentFound || items.length === 0 ? (
            <p className="text-ink-faint text-sm">No hay equipo disponible.</p>
          ) : (
            <>
              <div className="flex items-center justify-center gap-3">
                <div className="flex flex-col gap-2.5 items-end">
                  {LEFT_SLOTS.map((slotType) => (
                    <SlotRow key={slotType} item={itemsBySlot.get(slotType)} side="left" />
                  ))}
                </div>

                <div
                  className="relative w-[220px] h-[400px] shrink-0 rounded-lg overflow-hidden"
                  style={{
                    background: `radial-gradient(ellipse 85% 65% at 50% 20%, color-mix(in srgb, ${classColor} 45%, transparent), transparent 70%), radial-gradient(ellipse 70% 55% at 50% 100%, color-mix(in srgb, ${classColor} 22%, transparent), transparent 75%), linear-gradient(180deg, var(--color-surface-2), var(--color-canvas))`,
                  }}
                >
                  {renderUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={renderUrl}
                      alt="Render del personaje"
                      className="absolute w-full h-full object-cover"
                      style={{ transform: renderTransform(race, gender) }}
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <p className="text-ink-faint text-xs text-center px-3">Sin render disponible</p>
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-2.5 items-start">
                  {RIGHT_SLOTS.map((slotType) => (
                    <SlotRow key={slotType} item={itemsBySlot.get(slotType)} side="right" />
                  ))}
                </div>
              </div>

              <div className="flex justify-center items-center gap-8 mt-3">
                <SlotRow item={itemsBySlot.get("MAIN_HAND")} side="left" />
                <SlotRow item={itemsBySlot.get("OFF_HAND")} side="right" />
              </div>
            </>
          )}
        </div>
      </div>

      {equippedGems.length > 0 && (
        <div className="card p-5 mt-5">
          <h2 className="font-heading text-lg font-bold text-ink mb-4">
            Gemas equipadas ({equippedGems.length})
          </h2>
          <div className="flex flex-wrap gap-3">
            {equippedGems.map(({ gem, itemName }, index) => (
              <a
                key={`${gem.itemId}-${index}`}
                href={`https://www.wowhead.com/${wowheadGemParams(gem)}`}
                data-wowhead={wowheadGemParams(gem)}
                target="_blank"
                rel="noopener noreferrer"
                title={`Socketeada en ${itemName}`}
                className="inline-flex items-center gap-2 rounded-lg p-2 hover-surface transition-colors"
                style={{ border: "1px solid var(--color-line)" }}
              >
                <div
                  className="w-8 h-8 rounded-md shrink-0 overflow-hidden"
                  style={{ backgroundColor: "var(--color-line)" }}
                >
                  {gem.iconUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={gem.iconUrl} alt={gem.name} className="w-full h-full object-cover" />
                  )}
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-semibold text-ink line-clamp-2 max-w-[190px] leading-tight">
                    {gem.name}
                  </span>
                  {gem.displayString && (
                    <span className="text-label text-ink-faint truncate max-w-[190px] mt-0.5">
                      {gem.displayString}
                    </span>
                  )}
                </div>
              </a>
            ))}
          </div>
        </div>
      )}

      {equippedEnchants.length > 0 && (
        <div className="card p-5 mt-5">
          <h2 className="font-heading text-lg font-bold text-ink mb-4">
            Encantamientos equipados ({equippedEnchants.length})
          </h2>
          <div className="flex flex-wrap gap-3">
            {equippedEnchants.map(({ enchant, itemName }, index) => {
              const sourceParams = wowheadEnchantSourceParams(enchant);
              const content = (
                <>
                  <div
                    className="w-8 h-8 rounded-md shrink-0 overflow-hidden flex items-center justify-center"
                    style={
                      enchant.iconUrl
                        ? { backgroundColor: "var(--color-line)" }
                        : { backgroundColor: "color-mix(in srgb, var(--color-epic) 18%, var(--color-surface-2))" }
                    }
                  >
                    {enchant.iconUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={enchant.iconUrl}
                        alt={enchant.displayString}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Sparkles className="w-4 h-4" style={{ color: "var(--color-epic)" }} />
                    )}
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-semibold text-ink line-clamp-2 max-w-[190px] leading-tight">
                      {enchant.displayString}
                    </span>
                    <span className="text-label text-ink-faint truncate max-w-[190px] mt-0.5">
                      {enchant.slotType === "TEMPORARY" ? "Temporal · " : ""}
                      {itemName}
                    </span>
                  </div>
                </>
              );

              if (sourceParams) {
                return (
                  <a
                    key={`${enchant.enchantmentId}-${index}`}
                    href={`https://www.wowhead.com/${sourceParams}`}
                    data-wowhead={sourceParams}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={`En ${itemName}`}
                    className="inline-flex items-center gap-2 rounded-lg p-2 hover-surface transition-colors"
                    style={{ border: "1px solid var(--color-line)" }}
                  >
                    {content}
                  </a>
                );
              }

              return (
                <div
                  key={`${enchant.enchantmentId}-${index}`}
                  title={`En ${itemName}`}
                  className="inline-flex items-center gap-2 rounded-lg p-2"
                  style={{ border: "1px solid var(--color-line)" }}
                >
                  {content}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
