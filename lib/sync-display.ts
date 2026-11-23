import { findKeystoneDungeon } from "./mythic-plus-dungeons";
import {
  RewardTier,
  VaultRewardRow,
  RAID_DIFFICULTY_TIER,
  RAID_VAULT_ILVL,
  KEYSTONE_VAULT_REWARDS,
  DELVE_VAULT_REWARDS,
  isSeasonDataStale,
} from "./season";

export interface CharacterCurrency {
  currency_id: number;
  name: string | null;
  quantity: number;
  currency_type: string | null;
  total_earned: number | null;
  max_quantity: number | null;
  use_total_earned_for_max_qty: boolean | null;
  max_weekly_quantity: number | null;
  quantity_earned_this_week: number | null;
}

const GOLD_FORMATTER = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 });
const COMPACT_FORMATTER = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 });

export function formatExact(value: number | null | undefined): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return GOLD_FORMATTER.format(Math.floor(value));
}

export function formatCompact(value: number | null | undefined): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const n = Math.floor(value);
  const abs = Math.abs(n);

  if (abs < 1000) return String(n);
  if (abs < 10_000) return `${COMPACT_FORMATTER.format(n / 1000)}k`;

  const thousands = Math.round(n / 1000);
  if (Math.abs(thousands) < 1000) return `${thousands}k`;
  return `${COMPACT_FORMATTER.format(n / 1_000_000)}M`;
}

export function formatGold(gold: number | null | undefined): string | null {
  return formatCompact(gold);
}

export function formatRating(rating: number | null | undefined): string | null {
  if (typeof rating !== "number" || !Number.isFinite(rating)) return null;
  return String(Math.round(rating));
}

export interface KeystoneDisplay {
  short: string;
  full: string;
}

export function formatKeystone(keystone: unknown): KeystoneDisplay | null {
  const parsed = parseKeystoneRaw(keystone);
  if (!parsed) return null;

  const dungeon = findKeystoneDungeon(parsed.challengeModeID, parsed.mapId);

  if (!dungeon) return { short: `+${parsed.level}`, full: `+${parsed.level}` };
  return {
    short: `${dungeon.abbr} +${parsed.level}`,
    full: `${dungeon.name} +${parsed.level}`,
  };
}

export interface KeystoneRaw {
  level: number;
  challengeModeID: number | null;
  mapId: number | null;
}

export function parseKeystoneRaw(keystone: unknown): KeystoneRaw | null {
  if (!keystone || typeof keystone !== "object") return null;
  const raw = keystone as Record<string, unknown>;

  const level = raw.level;
  if (typeof level !== "number" || !Number.isFinite(level) || level <= 0) return null;

  return {
    level,
    challengeModeID: typeof raw.challengeModeID === "number" ? raw.challengeModeID : null,
    mapId: typeof raw.mapId === "number" ? raw.mapId : null,
  };
}

const CURRENCY_TYPE_ORDER = [
  "crest",
  "upgrade",
  "catalyst",
  "spark",
  "delve",
  "bonusroll",
  "cloak",
  "dinar",
];

function currencyTypeRank(type: string | null): number {
  const index = CURRENCY_TYPE_ORDER.indexOf(type ?? "");
  return index === -1 ? CURRENCY_TYPE_ORDER.length : index;
}

const CURRENCY_PRIORITY_RANKS = new Map<number, number>([
  [3442, 0], [3383, 0],
  [3443, 1], [3341, 1],
  [3444, 2], [3343, 2],
  [3445, 3], [3345, 3],
  [3446, 4], [3347, 4],
  [3465, 5], [3378, 5],
  [3513, 6], [3418, 6],
  [3310, 7],
  [3028, 8],
]);
const CURRENCY_PRIORITY_FALLBACK_RANK = 9;

const CREST_TRACK_ORDER = ["adventurer", "veteran", "champion", "hero", "myth"];

function currencyPriorityRank(currency: CharacterCurrency): number {
  return CURRENCY_PRIORITY_RANKS.get(currency.currency_id) ?? CURRENCY_PRIORITY_FALLBACK_RANK;
}

function crestTrackRank(currency: CharacterCurrency): number {
  if (currency.currency_type !== "crest") return CREST_TRACK_ORDER.length;
  const name = (currency.name ?? "").toLowerCase();
  const index = CREST_TRACK_ORDER.findIndex((track) => name.includes(track));
  return index === -1 ? CREST_TRACK_ORDER.length : index;
}

export function sortCurrencies(currencies: CharacterCurrency[]): CharacterCurrency[] {
  return [...currencies].sort((a, b) => {
    const priorityDiff = currencyPriorityRank(a) - currencyPriorityRank(b);
    if (priorityDiff !== 0) return priorityDiff;
    const typeDiff = currencyTypeRank(a.currency_type) - currencyTypeRank(b.currency_type);
    if (typeDiff !== 0) return typeDiff;
    const crestDiff = crestTrackRank(a) - crestTrackRank(b);
    if (crestDiff !== 0) return crestDiff;
    return a.currency_id - b.currency_id;
  });
}

export function currencyLabel(currency: CharacterCurrency): string {
  return currency.name?.trim() || `Moneda ${currency.currency_id}`;
}

export interface CurrencyAmount {
  text: string;
  exact: string;
  capHint: string | null;
  atCap: boolean;
  hasValue: boolean;
}

export function formatCurrencyAmount(currency: CharacterCurrency): CurrencyAmount {
  const text = formatCompact(currency.quantity) ?? String(currency.quantity);
  const exact = formatExact(currency.quantity) ?? String(currency.quantity);

  const weeklyCap = currency.max_weekly_quantity ?? 0;
  const seasonCap = currency.use_total_earned_for_max_qty ? currency.max_quantity ?? 0 : 0;
  const holdCap = currency.use_total_earned_for_max_qty ? 0 : currency.max_quantity ?? 0;

  let earned: number;
  let cap: number;
  let hint: string;

  if (weeklyCap > 0) {
    earned = currency.quantity_earned_this_week ?? 0;
    cap = weeklyCap;
    hint = `${earned}/${cap} obtenidos esta semana`;
  } else if (seasonCap > 0) {
    earned = currency.total_earned ?? 0;
    cap = seasonCap;
    hint = `${earned}/${cap} obtenidos en la temporada`;
  } else if (holdCap > 0) {
    earned = currency.quantity;
    cap = holdCap;
    hint = `${earned}/${cap} que puedes acumular`;
  } else {
    return { text, exact, capHint: null, atCap: false, hasValue: currency.quantity > 0 };
  }

  return {
    text,
    exact,
    capHint: hint,
    atCap: earned >= cap,
    hasValue: earned > 0 || currency.quantity > 0,
  };
}

export function currencyTooltip(currency: CharacterCurrency, amount: CurrencyAmount): string {
  const lines = [currencyLabel(currency), `Disponible: ${amount.exact}`];
  if (amount.capHint) lines.push(amount.atCap ? `${amount.capHint} (al tope)` : amount.capHint);
  return lines.join("\n");
}

export interface CharacterVaultSlot {
  slot_type: string;
  slot_index: number;
  threshold: number | null;
  progress: number | null;
  level: number | null;
  has_available_rewards: boolean;
  item_link: string | null;
  item_level: number | null;
}

const VAULT_TYPES = [
  { id: "3", key: "raid", label: "Raid" },
  { id: "1", key: "dungeon", label: "M+" },
  { id: "6", key: "world", label: "Mundo" },
  { id: "5", key: "concession", label: "Voidcore" },
] as const;

const VAULT_BONUS_CURRENCY_IDS = [3513, 3418];

const VAULT_BONUS_CURRENCY_NAME = "Nebulous Voidcore";

export function findVaultBonusCurrency(
  currencies: CharacterCurrency[] | null | undefined
): CharacterCurrency | null {
  const list = currencies ?? [];
  for (const id of VAULT_BONUS_CURRENCY_IDS) {
    const byId = list.find((c) => c.currency_id === id);
    if (byId) return byId;
  }
  return list.find((c) => c.name === VAULT_BONUS_CURRENCY_NAME) ?? null;
}

const REWARD_TIERS: Record<RewardTier, { label: string; color: string; accent: string | null }> = {
  lfr: { label: "LFR", color: "#9d9d9d", accent: null },
  normal: { label: "Normal", color: "#4ade80", accent: null },
  heroic: { label: "Heroico", color: "#3b82f6", accent: null },
  mythic: { label: "Mítico", color: "#a855f7", accent: null },
  mythicSpecial: { label: "Mítico flexible", color: "#a855f7", accent: "#ff7d0a" },
};

interface VaultReward {
  tier: RewardTier;
  label: string;
}

function rewardFromTiers(level: number, table: VaultRewardRow[]): VaultReward | null {
  for (const row of table) if (level >= row.min) return { tier: row.tier, label: row.label };
  return null;
}

function slotReward(
  vaultKey: string,
  level: number | null,
  seasonStale: boolean
): VaultReward | null {
  if (typeof level !== "number" || level <= 0) return null;
  if (vaultKey === "raid") {
    const tier = RAID_DIFFICULTY_TIER[level];
    if (!tier) return null;
    const ilvl = RAID_VAULT_ILVL[tier];
    return { tier, label: ilvl ? `${REWARD_TIERS[tier].label} (${ilvl})` : REWARD_TIERS[tier].label };
  }
  if (seasonStale) return null;
  if (vaultKey === "dungeon") {
    const reward = rewardFromTiers(level, KEYSTONE_VAULT_REWARDS);
    return reward ? { tier: reward.tier, label: `+${level} → ${reward.label}` } : null;
  }
  if (vaultKey === "world") {
    const reward = rewardFromTiers(level, DELVE_VAULT_REWARDS);
    return reward ? { tier: reward.tier, label: `Nivel ${level} → ${reward.label}` } : null;
  }
  return null;
}

export interface VaultSlotView {
  unlocked: boolean;
  color: string | null;
  accent: string | null;
  tierLabel: string | null;
  itemLink: string | null;
  itemLevel: number | null;
  progress: number | null;
  threshold: number | null;
}

export interface VaultGroup {
  key: string;
  label: string;
  unlocked: number;
  total: number;
  slots: VaultSlotView[];
  detail: string | null;
  concessionClaimableNow?: boolean;
}

const EMPTY_SLOT: VaultSlotView = {
  unlocked: false,
  color: null,
  accent: null,
  tierLabel: null,
  itemLink: null,
  itemLevel: null,
  progress: null,
  threshold: null,
};
const EMPTY_SLOTS: VaultSlotView[] = [EMPTY_SLOT, EMPTY_SLOT, EMPTY_SLOT];

export function summarizeVault(
  slots: CharacterVaultSlot[] | null | undefined,
  syncedSeasonId?: number | null
): VaultGroup[] {
  const seasonStale = isSeasonDataStale(syncedSeasonId);

  const groups: VaultGroup[] = VAULT_TYPES.map(({ id, key, label }) => {
    const own = (slots ?? [])
      .filter((s) => s.slot_type === id && (s.threshold ?? 0) > 0)
      .sort((a, b) => a.slot_index - b.slot_index);

    if (own.length === 0) {
      return { key, label, unlocked: 0, total: 3, slots: EMPTY_SLOTS, detail: null };
    }

    const view: VaultSlotView[] = own.map((s) => {
      const unlocked = (s.progress ?? 0) >= (s.threshold ?? 0);
      const reward = unlocked ? slotReward(key, s.level, seasonStale) : null;
      return {
        unlocked,
        color: reward ? REWARD_TIERS[reward.tier].color : null,
        accent: reward ? REWARD_TIERS[reward.tier].accent : null,
        tierLabel: reward ? reward.label : null,
        itemLink: s.item_link ?? null,
        itemLevel: s.item_level ?? null,
        progress: s.progress ?? null,
        threshold: s.threshold ?? null,
      };
    });

    const unlocked = view.filter((s) => s.unlocked).length;
    const progress = own[0].progress ?? 0;
    const next = own.find((s) => (s.progress ?? 0) < (s.threshold ?? 0));

    const tiers = view
      .filter((s) => s.tierLabel)
      .map((s) => s.tierLabel)
      .join(", ");

    const lines = [
      next
        ? `${label}: ${unlocked} de ${own.length} recompensas · ${progress}/${next.threshold} para la siguiente`
        : `${label}: ${unlocked} de ${own.length} recompensas · completo`,
    ];
    if (tiers) lines.push(`Recompensas: ${tiers}`);

    return { key, label, unlocked, total: own.length, slots: view, detail: lines.join("\n") };
  });

  const concessionIndex = groups.findIndex((g) => g.key === "concession");
  if (concessionIndex !== -1) {
    const concessionGroup = groups[concessionIndex];
    const concessionThreshold = concessionGroup.slots[0]?.threshold ?? 3;
    const otherSlots = groups.filter((g) => g.key !== "concession").flatMap((g) => g.slots);

    const freshChoices = otherSlots.filter((s) => s.unlocked).length;
    const claimableNowChoices = otherSlots.filter((s) => s.unlocked || s.itemLink !== null).length;

    const freshAvailable = concessionThreshold > 0 && freshChoices >= concessionThreshold;
    const claimableNow = concessionThreshold > 0 && claimableNowChoices >= concessionThreshold;

    groups[concessionIndex] = {
      ...concessionGroup,
      unlocked: freshAvailable ? 1 : 0,
      concessionClaimableNow: claimableNow,
      detail:
        concessionGroup.total > 0
          ? `${concessionGroup.label}: ${claimableNow ? "Disponible para reclamar" : "No disponible"} hoy (${claimableNowChoices} de ${concessionThreshold} premios reales) · ${freshChoices} de ${concessionThreshold} categorías con progreso fresco esta semana`
          : concessionGroup.detail,
    };
  }

  return groups;
}

export function hasVaultData(groups: VaultGroup[]): boolean {
  return groups.some((g) => g.detail !== null);
}

export function hasUnclaimedVaultReward(slots: CharacterVaultSlot[] | null | undefined): boolean {
  return (slots ?? []).some((s) => s.has_available_rewards);
}

export interface DelveBounty {
  itemID: number;
  bagCount: number;
  fluteBagCount: number;
  hasBuff: boolean;
  weeklyQuestClaimed: boolean;
  delveCompletionsThisWeek: number;
}

export type BountyPendingKey = "buff" | "map" | "flute" | "none";

export interface BountyStatus {
  weeklyQuestClaimed: boolean;
  completions: number;
  pendingKey: BountyPendingKey;
  pendingLabel: string;
  pendingColor: string;
  ringColor: string;
  iconFullColor: boolean;
  tooltipLines: string[];
}

const BOUNTY_PENDING_LABELS: Record<BountyPendingKey, string> = {
  buff: "Buff activo",
  map: "Mapa en bolsa",
  flute: "Flauta en bolsa",
  none: "Nada pendiente",
};

export function classifyDelveBounty(bounty: DelveBounty | null | undefined): BountyStatus | null {
  if (!bounty || typeof bounty.itemID !== "number") return null;

  const pendingKey: BountyPendingKey = bounty.hasBuff
    ? "buff"
    : bounty.bagCount > 0
      ? "map"
      : bounty.fluteBagCount > 0
        ? "flute"
        : "none";
  const hasExtra = pendingKey !== "none";
  const pendingColor = hasExtra ? "var(--color-epic)" : "var(--color-ink-faint)";
  const completions = bounty.delveCompletionsThisWeek;

  const ringColor =
    completions > 0 ? "var(--color-success)" : hasExtra ? "var(--color-epic)" : "var(--color-ink-faint)";

  return {
    weeklyQuestClaimed: bounty.weeklyQuestClaimed,
    completions,
    pendingKey,
    pendingLabel: BOUNTY_PENDING_LABELS[pendingKey],
    pendingColor,
    ringColor,
    iconFullColor: completions > 0,
    tooltipLines: [
      "Trovehunter's Bounty",
      `Mapa semanal: ${bounty.weeklyQuestClaimed ? "Reclamado" : "Disponible"}`,
      `Delves completadas esta semana: ${bounty.delveCompletionsThisWeek > 0 ? bounty.delveCompletionsThisWeek : "Ninguna todavía"}`,
      `Pendiente de usar: ${BOUNTY_PENDING_LABELS[pendingKey]}`,
      `Mapa en bolsa: ${bounty.bagCount}`,
      `Flauta en bolsa: ${bounty.fluteBagCount}`,
      `Buff activo: ${bounty.hasBuff ? "Sí" : "No"}`,
    ],
  };
}

