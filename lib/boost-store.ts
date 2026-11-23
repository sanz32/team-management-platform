import { unstable_cache } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  isSlotVisible,
  remainingCapacity,
  slotQueryFloor,
  type BoostCategory,
  type BoostSource,
  type BoostStatus,
} from "@/lib/boost";
import { applyDeal, dealDayKey, pickDailyDealIds, type DealCandidate } from "@/lib/boost-deals";

export const BOOST_CATALOG_TAG = "boost-catalogo";
export const BOOST_SHOWCASE_TAG = "boost-escaparate";

const CATALOG_TTL_SECONDS = 60;
const SHOWCASE_TTL_SECONDS = 600;

export interface PublicOffer {
  id: string;
  category: BoostCategory;
  groupLabel: string;
  titleEn: string;
  titleEs: string;
  descriptionEn: string | null;
  descriptionEs: string | null;
  priceGold: number;
  listPriceGold: number | null;
  badge: string | null;
  imageUrl: string | null;
}

export interface SlotContent {
  offerId: string;
  titleEn: string;
  titleEs: string;
  descriptionEn: string | null;
  descriptionEs: string | null;
  priceGold: number;
  listPriceGold: number | null;
}

export interface PublicSlot {
  id: string;
  scheduledAt: string;
  difficulty: BoostCategory;
  capacity: number;
  bookedCount: number;
  spotsLeft: number;
  contents: SlotContent[];
}

interface OfferRow {
  id: string;
  category: BoostCategory;
  group_label: string | null;
  title_en: string;
  title_es: string | null;
  description_en: string | null;
  description_es: string | null;
  price_gold: number;
  badge: string | null;
  image_url: string | null;
}

interface SlotRow {
  id: string;
  scheduled_at: string;
  difficulty: BoostCategory;
  capacity: number;
  booked_count: number;
  local_hold_count: number;
  is_active: boolean;
  boost_slot_offers?: {
    boost_offers: {
      id: string;
      title_en: string;
      title_es: string | null;
      description_en: string | null;
      description_es: string | null;
      price_gold: number;
      is_active: boolean;
    } | null;
  }[];
}

function visibleBadge(badge: string | null): string | null {
  if (!badge) return null;
  return badge.trim().toLowerCase() === "hot" ? null : badge;
}

function toOffer(row: OfferRow, enOferta: boolean): PublicOffer {
  const precios = applyDeal(Number(row.price_gold), enOferta);
  return {
    id: row.id,
    category: row.category,
    groupLabel: row.group_label ?? "",
    titleEn: row.title_en,
    titleEs: row.title_es || row.title_en,
    descriptionEn: row.description_en,
    descriptionEs: row.description_es || row.description_en,
    priceGold: precios.priceGold,
    listPriceGold: precios.listPriceGold,
    badge: visibleBadge(row.badge),
    imageUrl: row.image_url,
  };
}

function toDealCandidate(row: { id: string; category: BoostCategory; group_label: string | null }): DealCandidate {
  return { id: row.id, category: row.category, groupLabel: row.group_label ?? "" };
}

const fetchDealCandidateRows = unstable_cache(
  async (): Promise<{ id: string; category: BoostCategory; group_label: string | null }[]> => {
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from("boost_offers")
      .select("id, category, group_label")
      .eq("is_active", true);

    if (error) throw new Error(error.message);
    return (data ?? []) as { id: string; category: BoostCategory; group_label: string | null }[];
  },
  ["boost-deal-candidates"],
  { tags: [BOOST_CATALOG_TAG], revalidate: CATALOG_TTL_SECONDS }
);

export async function getDealIdsForDay(dayKey: string): Promise<Set<string>> {
  const rows = await fetchDealCandidateRows();
  return pickDailyDealIds(rows.map(toDealCandidate), dayKey);
}

export async function getDailyDealIds(now: Date = new Date()): Promise<Set<string>> {
  return getDealIdsForDay(dealDayKey(now));
}

const OFFER_COLUMNS =
  "id, category, group_label, title_en, title_es, description_en, description_es, price_gold, badge, image_url";

const fetchActiveOfferRows = unstable_cache(
  async (): Promise<OfferRow[]> => {
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from("boost_offers")
      .select(OFFER_COLUMNS)
      .eq("is_active", true)
      .order("category")
      .order("price_gold");

    if (error) throw new Error(error.message);
    return (data ?? []) as OfferRow[];
  },
  ["boost-offers-activos"],
  { tags: [BOOST_CATALOG_TAG], revalidate: CATALOG_TTL_SECONDS }
);

export async function getActiveOffers(now: Date = new Date()): Promise<PublicOffer[]> {
  const rows = await fetchActiveOfferRows();
  const enOferta = pickDailyDealIds(rows.map(toDealCandidate), dealDayKey(now));

  return (
    rows
      .map((row) => toOffer(row, enOferta.has(row.id)))
      .sort((a, b) => a.priceGold - b.priceGold)
  );
}

export async function getActiveOfferById(id: string, now: Date = new Date()): Promise<PublicOffer | null> {
  const supabase = createServerSupabaseClient();
  const [{ data, error }, enOferta] = await Promise.all([
    supabase.from("boost_offers").select(OFFER_COLUMNS).eq("id", id).eq("is_active", true).maybeSingle(),
    getDailyDealIds(now),
  ]);

  if (error) throw new Error(error.message);
  return data ? toOffer(data as OfferRow, enOferta.has((data as OfferRow).id)) : null;
}

export async function getListedSlots(
  difficulty?: BoostCategory,
  now: Date = new Date()
): Promise<PublicSlot[]> {
  const supabase = createServerSupabaseClient();
  let query = supabase
    .from("boost_schedule_slots")
    .select(
      "id, scheduled_at, difficulty, capacity, booked_count, local_hold_count, is_active, boost_slot_offers(boost_offers(id, title_en, title_es, description_en, description_es, price_gold, is_active))"
    )
    .eq("is_active", true)
    .gte("scheduled_at", slotQueryFloor(now).toISOString())
    .order("scheduled_at");

  if (difficulty) query = query.eq("difficulty", difficulty);

  const [{ data, error }, enOferta] = await Promise.all([query, getDailyDealIds(now)]);
  if (error) throw new Error(error.message);

  return ((data ?? []) as unknown as SlotRow[])
    .filter((row) => isSlotVisible({ scheduledAt: row.scheduled_at, isActive: row.is_active }, now))
    .map((row) => ({
      id: row.id,
      scheduledAt: row.scheduled_at,
      difficulty: row.difficulty,
      capacity: row.capacity,
      bookedCount: row.booked_count,
      spotsLeft: remainingCapacity(row.capacity, row.booked_count, row.local_hold_count),
      contents: (row.boost_slot_offers ?? [])
        .map((link) => link.boost_offers)
        .filter((offer): offer is NonNullable<typeof offer> => !!offer && offer.is_active)
        .map((offer) => {
          const precios = applyDeal(Number(offer.price_gold), enOferta.has(offer.id));
          return {
            offerId: offer.id,
            titleEn: offer.title_en,
            titleEs: offer.title_es || offer.title_en,
            descriptionEn: offer.description_en,
            descriptionEs: offer.description_es || offer.description_en,
            priceGold: precios.priceGold,
            listPriceGold: precios.listPriceGold,
          };
        })
        .sort((a, b) => a.priceGold - b.priceGold),
    }))
    .filter((slot) => slot.contents.length > 0);
}

export interface BookingRow {
  id: string;
  status: BoostStatus;
  statusToken: string;
  createdAt: string;
  source: BoostSource;
  offerTitle: string;
  offerPriceGold: number | null;
  offerCategory: string;
  slotScheduledAt: string | null;
  characterName: string;
  characterRealm: string;
  characterRegion: string;
  characterClass: string | null;
  characterSpec: string | null;
  characterIlvl: number | null;
  buyerDiscordId: string;
  buyerDiscordUsername: string | null;
  buyerDiscordAvatarUrl: string | null;
  buyerNote: string | null;
  raiderOwnerId: string | null;
  raiderName: string | null;
  raiderDiscordId: string | null;
}

interface RawBookingRow {
  id: string;
  status: BoostStatus;
  status_token: string;
  created_at: string;
  source: BoostSource;
  offer_title: string;
  offer_price_gold: number | null;
  offer_category: string;
  slot_scheduled_at: string | null;
  character_name: string;
  character_realm: string;
  character_region: string;
  character_class: string | null;
  character_spec: string | null;
  character_ilvl: number | null;
  buyer_discord_id: string;
  buyer_discord_username: string | null;
  buyer_discord_avatar_url: string | null;
  buyer_note: string | null;
  raider_owner_id: string | null;
  app_users?: { nickname: string | null; discord_username: string | null; discord_id: string | null } | null;
}

export const BOOKING_COLUMNS =
  "id, status, status_token, created_at, source, offer_title, offer_price_gold, offer_category, slot_scheduled_at, character_name, character_realm, character_region, character_class, character_spec, character_ilvl, buyer_discord_id, buyer_discord_username, buyer_discord_avatar_url, buyer_note, raider_owner_id, app_users(nickname, discord_username, discord_id)";

export const PUBLIC_BOOKING_COLUMNS =
  "status, offer_title, offer_price_gold, slot_scheduled_at, character_name, character_realm, character_region, app_users(nickname, discord_username, discord_id)";

export interface PublicBookingView {
  status: BoostStatus;
  offerTitle: string;
  offerPriceGold: number | null;
  slotScheduledAt: string | null;
  characterName: string;
  characterRealm: string;
  characterRegion: string;
  raiderName: string | null;
  raiderDiscordId: string | null;
}

interface RawPublicBookingRow {
  status: BoostStatus;
  offer_title: string;
  offer_price_gold: number | null;
  slot_scheduled_at: string | null;
  character_name: string;
  character_realm: string;
  character_region: string;
  app_users?: { nickname: string | null; discord_username: string | null; discord_id: string | null } | null;
}

export function toPublicBooking(row: RawPublicBookingRow): PublicBookingView {
  return {
    status: row.status,
    offerTitle: row.offer_title,
    offerPriceGold: row.offer_price_gold == null ? null : Number(row.offer_price_gold),
    slotScheduledAt: row.slot_scheduled_at,
    characterName: row.character_name,
    characterRealm: row.character_realm,
    characterRegion: row.character_region,
    raiderName: row.app_users ? (row.app_users.nickname ?? row.app_users.discord_username) : null,
    raiderDiscordId: row.app_users?.discord_id ?? null,
  };
}

export function toBooking(row: RawBookingRow): BookingRow {
  return {
    id: row.id,
    status: row.status,
    statusToken: row.status_token,
    createdAt: row.created_at,
    source: row.source,
    offerTitle: row.offer_title,
    offerPriceGold: row.offer_price_gold == null ? null : Number(row.offer_price_gold),
    offerCategory: row.offer_category,
    slotScheduledAt: row.slot_scheduled_at,
    characterName: row.character_name,
    characterRealm: row.character_realm,
    characterRegion: row.character_region,
    characterClass: row.character_class,
    characterSpec: row.character_spec,
    characterIlvl: row.character_ilvl,
    buyerDiscordId: row.buyer_discord_id,
    buyerDiscordUsername: row.buyer_discord_username,
    buyerDiscordAvatarUrl: row.buyer_discord_avatar_url,
    buyerNote: row.buyer_note,
    raiderOwnerId: row.raider_owner_id,
    raiderName: row.app_users ? (row.app_users.nickname ?? row.app_users.discord_username) : null,
    raiderDiscordId: row.app_users?.discord_id ?? null,
  };
}

export interface ShowcaseBoss {
  name: string;
  imageUrl: string | null;
  raidId: string;
}

export interface ShowcaseRaid {
  id: string;
  name: string;
  abbr: string | null;
  color: string | null;
  imageUrl: string | null;
  bosses: ShowcaseBoss[];
}

const SERVABLE_IMAGE_HOSTS = ["wow.zamimg.com", "render.worldofwarcraft.com"];

const LOCAL_RAID_BANNERS: Record<string, string> = {
  venomous_abyss: "/brand/raid-banners/venomous-abyss.jpg",
  tidebound_grotto: "/brand/raid-banners/tidebound-grotto.webp",
};

function isServableImage(url: string | null): boolean {
  if (!url) return false;
  try {
    const { hostname, protocol } = new URL(url);
    if (protocol !== "https:") return false;
    return SERVABLE_IMAGE_HOSTS.some((host) => hostname === host);
  } catch {
    return false;
  }
}

export const getSeasonShowcase = unstable_cache(
  getSeasonShowcaseUncached,
  ["boost-escaparate-temporada"],
  { tags: [BOOST_SHOWCASE_TAG], revalidate: SHOWCASE_TTL_SECONDS }
);

async function getSeasonShowcaseUncached(): Promise<ShowcaseRaid[]> {
  const supabase = createServerSupabaseClient();

  const { data: season, error: seasonError } = await supabase
    .from("raid_seasons")
    .select("id")
    .eq("is_current", true)
    .maybeSingle();

  if (seasonError) throw new Error(seasonError.message);
  if (!season) return [];

  const seasonId = (season as { id: string }).id;

  const [raidsRes, bossesRes] = await Promise.all([
    supabase
      .from("season_raids")
      .select("id, name, raid_key, abbr, color, header_image_url, order_index")
      .eq("season_id", seasonId)
      .order("order_index"),
    supabase
      .from("raid_bosses")
      .select("name, image_url, season_raid_id, order_index")
      .eq("season_id", seasonId)
      .order("order_index"),
  ]);

  if (raidsRes.error) throw new Error(raidsRes.error.message);
  if (bossesRes.error) throw new Error(bossesRes.error.message);

  const bosses = (bossesRes.data ?? []) as {
    name: string;
    image_url: string | null;
    season_raid_id: string | null;
  }[];

  return ((raidsRes.data ?? []) as {
    id: string;
    name: string;
    raid_key: string | null;
    abbr: string | null;
    color: string | null;
    header_image_url: string | null;
  }[]).map((raid) => ({
    id: raid.id,
    name: raid.name,
    abbr: raid.abbr,
    color: raid.color,
    imageUrl:
      (raid.raid_key ? LOCAL_RAID_BANNERS[raid.raid_key] : null) ??
      (isServableImage(raid.header_image_url) ? raid.header_image_url : null),
    bosses: bosses
      .filter((b) => b.season_raid_id === raid.id)
      .map((b) => ({
        name: b.name,
        imageUrl: isServableImage(b.image_url) ? b.image_url : null,
        raidId: raid.id,
      })),
  }));
}
