"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { capitalize } from "@/lib/format";
import { classBannerUrl, classColor, classGlow, shortSpec } from "@/lib/wow-classes";
import { factionColor, factionLabel } from "@/lib/faction";
import {
  formatKeystone,
  formatRating,
  hasVaultData,
  hasUnclaimedVaultReward,
  summarizeVault,
  findVaultBonusCurrency,
  type VaultGroup,
  type CharacterCurrency,
} from "@/lib/sync-display";
import { cascadeStyle } from "@/lib/cascade";
import type { RaidDef } from "@/lib/raids";
import TierSetBadge from "@/app/components/TierSetBadge";
import VaultMeter from "@/app/components/VaultMeter";
import CurrencyIcon from "@/app/components/CurrencyIcon";
import BossProgressSection from "./BossProgressSection";
import DungeonPoolSection from "./DungeonPoolSection";
import CurrenciesSection from "./CurrenciesSection";
import VaultSlotCell from "./VaultSlotCell";
import SyncCta from "./SyncCta";
import { parseItemLink } from "@/lib/wow-item-link";
import type { ListCharacter } from "./DatosPersonajesClient";

function HeaderStat({
  label,
  value,
  title,
  accent,
  badge,
}: {
  label: string;
  value: string;
  title?: string;
  accent?: string;
  badge?: React.ReactNode;
}) {
  return (
    <div className="min-w-0 px-4 first:pl-0 border-l border-line first:border-l-0" title={title}>
      <p className="font-data text-micro uppercase tracking-[0.12em] text-ink-faint">{label}</p>
      <p className="flex items-center gap-2 min-w-0 mt-1">
        <span
          className="font-data font-bold text-[clamp(1.4rem,1.9vw,2rem)] leading-none truncate"
          style={{ color: accent ?? "var(--color-ink)" }}
        >
          {value}
        </span>
        {badge}
      </p>
    </div>
  );
}

export default function CharacterDetailPanel({
  character,
  raids,
  currencyIcons,
  vaultItemIcons,
  syncedSeasonId,
  loading,
  isOwner,
}: {
  character: ListCharacter | null;
  raids: RaidDef[];
  currencyIcons: Record<number, string>;
  vaultItemIcons: Record<number, string>;
  syncedSeasonId: number | null;
  loading: boolean;
  isOwner: boolean;
}) {
  if (loading) {
    return (
      <div className="card p-6">
        <p className="text-ink-faint text-sm text-center py-20">Cargando datos...</p>
      </div>
    );
  }

  if (!character) {
    return (
      <div className="card p-6">
        <p className="text-ink-faint text-sm text-center py-20">
          Elige un personaje de la lista para ver sus datos.
        </p>
      </div>
    );
  }

  const color = classColor(character.class);
  const banner = classBannerUrl(character.class);
  const rating = formatRating(character.mythic_plus_rating);
  const keystone = formatKeystone(character.mythic_plus_keystone);

  return (
    <div className="min-w-0 space-y-4">
      <div
        className="card card-glow relative overflow-hidden"
        style={
          {
            borderLeft: `4px solid ${color}`,
            "--card-glow": classGlow(character.class),
          } as React.CSSProperties
        }
      >
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            backgroundImage: banner
              ? `linear-gradient(90deg, rgba(11,14,21,0.95) 0%, rgba(11,14,21,0.82) 45%, rgba(11,14,21,0.4) 100%), url(${banner})`
              : `linear-gradient(120deg, color-mix(in srgb, ${color} 22%, var(--color-surface-2)), var(--color-surface))`,
            backgroundSize: "cover",
            backgroundPosition: "center 28%",
          }}
        />

        <div className="relative p-6 flex flex-wrap items-end justify-between gap-x-8 gap-y-5">
          <div className="min-w-0">
            <h2 className="font-heading font-bold text-ink leading-[0.95] tracking-[-0.03em] text-[clamp(1.9rem,3vw,3rem)]">
              {capitalize(character.name)}
            </h2>
            <p className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 font-data text-label uppercase tracking-[0.1em]">
              <span className="text-ink-faint">{character.realm_name ?? character.realm_slug}</span>
              <span className="text-ink-faint/50" aria-hidden>
                ·
              </span>
              <span style={{ color }}>{shortSpec(character.class, character.active_spec)}</span>
              {character.faction && (
                <>
                  <span className="text-ink-faint/50" aria-hidden>
                    ·
                  </span>
                  <span style={{ color: factionColor(character.faction) }}>
                    {factionLabel(character.faction)}
                  </span>
                </>
              )}
              {character.ownerName && (
                <>
                  <span className="text-ink-faint/50" aria-hidden>
                    ·
                  </span>
                  <span className="text-ink-muted normal-case tracking-normal">
                    {character.ownerName}
                  </span>
                </>
              )}
            </p>
            <Link
              href={`/characters/${character.id}`}
              prefetch={false}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 text-xs text-ink-muted hover:text-ink transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Ver equipo en el Armory
            </Link>
          </div>

          <div className="flex items-end">
            <HeaderStat
              label="ilvl"
              value={character.ilvl != null ? String(character.ilvl) : "—"}
              accent={character.ilvl != null ? "var(--color-gold)" : undefined}
              badge={
                <TierSetBadge
                  count={character.tier_piece_count}
                  sets={character.tier_pieces}
                  legacySetName={character.tier_set_name}
                />
              }
            />
            <HeaderStat label="IO" value={rating ?? "—"} />
            <HeaderStat label="Llave" value={keystone?.short ?? "—"} title={keystone?.full} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 xl:[grid-auto-rows:1fr] xl:min-h-[19.5rem]">
        <VaultSection
          character={character}
          syncedSeasonId={syncedSeasonId}
          vaultItemIcons={vaultItemIcons}
          currencyIcons={currencyIcons}
          isOwner={isOwner}
        />
        <DungeonPoolSection
          keystone={character.mythic_plus_keystone}
          dungeons={character.mythic_plus_dungeons}
          hasSynced={character.desktop_synced_at != null || character.gg_observed_at != null}
          isOwner={isOwner}
        />
      </div>

      <BossProgressSection character={character} raids={raids} />

      <CurrenciesSection
        currencies={character.currencies}
        currencyIcons={currencyIcons}
        bounty={character.delve_bounty}
        bountyIconUrl={
          character.delve_bounty ? (vaultItemIcons[character.delve_bounty.itemID] ?? null) : null
        }
        isOwner={isOwner}
      />
    </div>
  );
}

function CategoryRow({
  group,
  index,
  variant,
  vaultItemIcons,
  bonusCurrency,
  bonusCurrencyIconUrl,
}: {
  group: VaultGroup;
  index: number;
  variant: "items" | "progress";
  vaultItemIcons: Record<number, string>;
  bonusCurrency?: CharacterCurrency | null;
  bonusCurrencyIconUrl?: string | null;
}) {
  const isBonusCurrency = group.key === "concession";
  const bonusAvailable = variant === "items" ? (group.concessionClaimableNow ?? false) : group.unlocked > 0;

  return (
    <div
      title={group.detail ?? `${group.label}: sin datos`}
      style={{
        ...cascadeStyle(index),
        backgroundColor: "var(--color-surface-2)",
        border:
          variant === "items"
            ? "1px solid color-mix(in srgb, var(--color-gold) 28%, var(--color-line))"
            : "1px solid var(--color-line)",
      }}
      className="cascade-item flex-1 min-h-0 rounded-xl px-3.5 py-1 flex items-center gap-2"
    >
      <span className="w-14 shrink-0 font-data text-micro font-bold uppercase tracking-[0.08em] text-ink-faint">
        {group.label}
      </span>
      <span className="flex-1" />
      {isBonusCurrency ? (
        <div className="flex items-center gap-2 shrink-0" title={bonusCurrency?.name ?? "Nebulous Voidcore"}>
          <CurrencyIcon
            url={bonusCurrencyIconUrl ?? null}
            name={bonusCurrency?.name ?? "Nebulous Voidcore"}
            size={variant === "items" ? 24 : 18}
          />
          <span
            className="font-data text-label"
            style={{ color: bonusAvailable ? "var(--color-success)" : "var(--color-ink-faint)" }}
          >
            {bonusAvailable ? "Disponible" : "No disponible"}
          </span>
        </div>
      ) : variant === "items" ? (
        <div className="flex gap-2 shrink-0">
          {group.slots.map((slot, i) => {
            const parsed = parseItemLink(slot.itemLink);
            return (
              <VaultSlotCell
                key={i}
                slot={slot}
                categoryLabel={group.label}
                iconUrl={parsed ? (vaultItemIcons[parsed.itemId] ?? null) : null}
              />
            );
          })}
        </div>
      ) : (
        <>
          <VaultMeter group={group} squareSize={16} showLabel={false} />
          <span className="font-data text-label text-ink-faint shrink-0 w-14 text-right">
            {group.unlocked} de {group.total}
          </span>
        </>
      )}
    </div>
  );
}

function VaultSection({
  character,
  syncedSeasonId,
  vaultItemIcons,
  currencyIcons,
  isOwner,
}: {
  character: ListCharacter;
  syncedSeasonId: number | null;
  vaultItemIcons: Record<number, string>;
  currencyIcons: Record<number, string>;
  isOwner: boolean;
}) {
  const groups = summarizeVault(character.vault, syncedSeasonId);
  const bonusCurrency = findVaultBonusCurrency(character.currencies);
  const bonusCurrencyIconUrl = bonusCurrency ? (currencyIcons[bonusCurrency.currency_id] ?? null) : null;
  const hasData = hasVaultData(groups);
  const showUnclaimed = hasUnclaimedVaultReward(character.vault);
  const unlockedSlots = groups.flatMap((g) => g.slots).filter((s) => s.unlocked);
  const anyItemVisible = groups.some((g) => g.slots.some((s) => parseItemLink(s.itemLink)));
  const pendingVaultOpen = showUnclaimed && !anyItemVisible && unlockedSlots.length > 0;
  const showBlur = !showUnclaimed || pendingVaultOpen;

  return (
    <section className="card p-5 h-full flex flex-col">
      <header className="mb-4">
        <h3 className="font-heading text-base font-bold text-ink">Gran Vault</h3>
        <p className="text-ink-faint text-xs mt-1">
          Recompensas ya ganadas esta semana. Pasa el mouse por una categoría para ver su nivel.
        </p>
      </header>

      {hasData ? (
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-4">
          <div className="min-h-0 flex flex-col relative">
            <p className="font-data text-micro font-bold uppercase tracking-[0.08em] text-ink-faint mb-2.5">
              Recompensas de esta semana sin tomar
            </p>
            <div
              className={`flex-1 min-h-0 flex flex-col gap-2 ${
                showBlur ? "blur-[2px] select-none pointer-events-none" : ""
              }`}
            >
              {groups.map((group, index) => (
                <CategoryRow
                  key={group.key}
                  group={group}
                  index={index}
                  variant="items"
                  vaultItemIcons={vaultItemIcons}
                  bonusCurrency={bonusCurrency}
                  bonusCurrencyIconUrl={bonusCurrencyIconUrl}
                />
              ))}
            </div>
            {showBlur && (
              <div className="absolute inset-0 top-6 flex items-center justify-center px-4 text-center">
                <p
                  className="text-sm font-semibold leading-snug rounded-lg px-3 py-2"
                  style={{
                    backgroundColor: "rgba(8,10,16,0.78)",
                    color: pendingVaultOpen ? "var(--color-warning)" : "var(--color-ink)",
                  }}
                >
                  <span className="block whitespace-nowrap">
                    {pendingVaultOpen ? "Abre el vault para" : "Ya reclamaste vault"}
                  </span>
                  <span className="block whitespace-nowrap">
                    {pendingVaultOpen ? "ver las recompensas" : "esta semana"}
                  </span>
                </p>
              </div>
            )}
          </div>

          <div className="min-h-0 flex flex-col lg:border-l lg:border-line lg:pl-4">
            <p className="font-data text-micro font-bold uppercase tracking-[0.08em] text-ink-faint mb-2.5">
              Progreso del vault esta semana
            </p>
            <div className="flex-1 min-h-0 flex flex-col gap-2">
              {groups.map((group, index) => (
                <CategoryRow
                  key={group.key}
                  group={group}
                  index={index}
                  variant="progress"
                  vaultItemIcons={vaultItemIcons}
                  bonusCurrency={bonusCurrency}
                  bonusCurrencyIconUrl={bonusCurrencyIconUrl}
                />
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-center py-6">
          <SyncCta isOwner={isOwner} message="Este personaje todavía no subió su Gran Vault." />
        </div>
      )}
    </section>
  );
}
