import { NextRequest, NextResponse, after } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getCurrentLockoutWeek } from "@/lib/wow-reset";
import { fetchAllBossKills } from "@/lib/boss-kills";
import { fetchAllCharacterCurrencies } from "@/lib/character-currencies";
import { fetchAllCharacterVault } from "@/lib/character-vault";
import { getTrackedCurrencyIds, getCurrencyIcons } from "@/lib/currencies";
import { getLatestSyncedSeasonId } from "@/lib/desktop-sync";
import { refreshWclLockoutsIfStale } from "@/lib/lockout-freshness";
import { refreshFriendLockoutsIfStale } from "@/lib/friend-lockout-freshness";
import { getRemovedUserIds } from "@/lib/removed-members";
import { getFriendUserIds } from "@/lib/friend-members";
import { getGoalTargets } from "@/lib/guild-goals";
import { closeElapsedGoalWeeksIfStale, getGoalDebtsByUser } from "@/lib/goal-history";
import { settleGoalDebts } from "@/lib/goal-progress";
import { getMainClassesByUser } from "@/lib/main-classes";
import { getPairedUserIds } from "@/lib/sync-device-pairing";
import { getFrameColorsByUser } from "@/lib/frame-colors";
import { resolveItemIcons } from "@/lib/character-armory";
import { parseItemLink } from "@/lib/wow-item-link";

interface CharacterRow {
  id: string;
  user_id: string;
  region: string;
  gold: number | null;
  app_users?: {
    id: string;
    discord_username: string | null;
    nickname: string | null;
    avatar_url: string | null;
    has_mochila: boolean | null;
    mochila_count: number | null;
  } | null;
}

interface AttachedCurrency {
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

interface AttachedVaultSlot {
  slot_type: string;
  slot_index: number;
  threshold: number | null;
  progress: number | null;
  level: number | null;
  has_available_rewards: boolean;
  item_link: string | null;
  item_level: number | null;
}

async function resolveVaultItemIcons(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  characters: { region: string; vault: AttachedVaultSlot[]; delve_bounty?: unknown }[]
): Promise<Record<number, string>> {
  const itemIdsByRegion = new Map<string, Set<number>>();
  for (const c of characters) {
    for (const slot of c.vault) {
      const parsed = parseItemLink(slot.item_link);
      if (!parsed) continue;
      if (!itemIdsByRegion.has(c.region)) itemIdsByRegion.set(c.region, new Set());
      itemIdsByRegion.get(c.region)!.add(parsed.itemId);
    }
    const bounty = c.delve_bounty as { itemID?: unknown } | null | undefined;
    if (bounty && typeof bounty.itemID === "number") {
      if (!itemIdsByRegion.has(c.region)) itemIdsByRegion.set(c.region, new Set());
      itemIdsByRegion.get(c.region)!.add(bounty.itemID);
    }
  }
  if (itemIdsByRegion.size === 0) return {};

  const icons: Record<number, string> = {};
  await Promise.all(
    Array.from(itemIdsByRegion.entries()).map(async ([region, itemIds]) => {
      const resolved = await resolveItemIcons(supabase, region, Array.from(itemIds));
      for (const [itemId, url] of resolved) {
        if (url) icons[itemId] = url;
      }
    })
  );
  return icons;
}

async function attachKillsAndCurrencies<T extends CharacterRow>(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  characters: T[],
  trackedCurrencyIds: number[]
): Promise<(T & { kills: string[]; currencies: AttachedCurrency[]; vault: AttachedVaultSlot[] })[]> {
  if (characters.length === 0) return [];

  const characterIds = characters.map((c) => c.id);
  const [kills, currencies, vault] = await Promise.all([
    fetchAllBossKills(supabase, characterIds),
    fetchAllCharacterCurrencies(supabase, characterIds, trackedCurrencyIds),
    fetchAllCharacterVault(supabase, characterIds),
  ]);

  return characters.map((c) => {
    const currentWeek = getCurrentLockoutWeek(c.region);
    const killsThisWeek = kills
      .filter((k) => k.character_id === c.id && k.lockout_week === currentWeek)
      .map((k) => k.boss_key);
    const ownCurrencies = currencies
      .filter((cur) => cur.character_id === c.id)
      .map(({ character_id: _ignored, ...currency }) => currency);
    const ownVault = vault
      .filter((v) => v.character_id === c.id)
      .map(({ character_id: _ignored, ...slot }) => slot);
    return { ...c, kills: killsThisWeek, currencies: ownCurrencies, vault: ownVault };
  });
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const discordId = session.user.discordId;
  const appRole = session.user.appRole;
  const canSeeAll =
    appRole === "admin" || appRole === "manager" || appRole === "guest" || appRole === "member";
  const wantsAll = req.nextUrl.searchParams.get("all") === "true";
  const wantsVaultIcons = req.nextUrl.searchParams.get("vaultIcons") === "true";

  const supabase = createServerSupabaseClient();

  after(() => refreshWclLockoutsIfStale(supabase));

  if (appRole === "friend" && session.user.appUserId) {
    const friendAppUserId = session.user.appUserId;
    after(() => refreshFriendLockoutsIfStale(supabase, friendAppUserId));
  }

  after(() => closeElapsedGoalWeeksIfStale(supabase));

  try {
    const [{ data: appUser }, trackedCurrencyIds, currencyIcons, syncedSeasonId] =
      await Promise.all([
        supabase.from("app_users").select("id, has_mochila, mochila_count").eq("discord_id", discordId).maybeSingle(),
        getTrackedCurrencyIds(supabase),
        getCurrencyIcons(supabase),
        getLatestSyncedSeasonId(supabase),
      ]);

    if (!appUser) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }

    if (wantsAll && canSeeAll) {
      const { data, error } = await supabase
        .from("characters")
        .select("*, app_users(id, discord_username, nickname, avatar_url, has_mochila, mochila_count)")
        .order("name");

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      const allCharacters = (data ?? []) as unknown as CharacterRow[];
      const [
        removedUserIds,
        friendUserIds,
        goals,
        mainClassesByUserMap,
        goalDebts,
        pairedUserIds,
        frameColorsByUser,
      ] = await Promise.all([
        getRemovedUserIds(supabase),
        getFriendUserIds(supabase),
        getGoalTargets(supabase),
        getMainClassesByUser(supabase),
        getGoalDebtsByUser(supabase),
        getPairedUserIds(supabase),
        getFrameColorsByUser(supabase),
      ]);
      const hidesFriends = appRole !== "admin";
      const characters = allCharacters.filter(
        (c) => !removedUserIds.has(c.user_id) && !(hidesFriends && friendUserIds.has(c.user_id))
      );
      const mainClassesByUser: Record<string, string[]> = Object.fromEntries(
        Array.from(mainClassesByUserMap.entries()).map(([userId, classes]) => [
          userId,
          Array.from(classes),
        ])
      );
      const charactersByUser = new Map<string, { ilvl: number | null; class: string | null }[]>();
      for (const c of allCharacters) {
        const list = charactersByUser.get(c.user_id) ?? [];
        const raw = c as unknown as { ilvl?: number | null; class?: string | null };
        list.push({ ilvl: raw.ilvl ?? null, class: raw.class ?? null });
        charactersByUser.set(c.user_id, list);
      }
      const openGoalDebts = settleGoalDebts(goalDebts, charactersByUser, mainClassesByUserMap);

      const withKills = await attachKillsAndCurrencies(supabase, characters, trackedCurrencyIds);
      const vaultItemIcons = wantsVaultIcons ? await resolveVaultItemIcons(supabase, withKills) : {};

      const byMember = new Map<
        string,
        {
          user_id: string;
          discord_username: string;
          avatar_url: string | null;
          has_mochila: boolean;
          mochila_count: number;
          has_app: boolean;
          frame_color_1: string | null;
          frame_color_2: string | null;
          frame_name_style: string | null;
          characters: CharacterRow[];
        }
      >();
      for (const c of withKills) {
        const ownerId = c.user_id;
        const ownerName = c.app_users?.nickname ?? c.app_users?.discord_username ?? "Desconocido";
        if (!byMember.has(ownerId)) {
          const frameColors = frameColorsByUser.get(ownerId);
          byMember.set(ownerId, {
            user_id: ownerId,
            discord_username: ownerName,
            avatar_url: c.app_users?.avatar_url ?? null,
            has_mochila: c.app_users?.has_mochila ?? false,
            mochila_count: c.app_users?.mochila_count ?? 0,
            has_app: pairedUserIds.has(ownerId),
            frame_color_1: frameColors?.color1 ?? null,
            frame_color_2: frameColors?.color2 ?? null,
            frame_name_style: frameColors?.nameStyle ?? null,
            characters: [],
          });
        }
        const { app_users, ...character } = c;
        byMember.get(ownerId)!.characters.push({ ...character, gold: null });
      }

      return NextResponse.json({
        canSeeAll,
        currencyIcons,
        vaultItemIcons,
        syncedSeasonId,
        myUserId: appUser.id,
        hasMochila: appUser.has_mochila ?? false,
        mochilaCount: appUser.mochila_count ?? 0,
        members: Array.from(byMember.values()).sort((a, b) =>
          a.discord_username.localeCompare(b.discord_username)
        ),
        goals,
        mainClassesByUser,
        goalDebts: openGoalDebts,
      });
    }

    const { data, error } = await supabase
      .from("characters")
      .select("*")
      .eq("user_id", appUser.id)
      .order("name");

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const withKills = await attachKillsAndCurrencies(
      supabase,
      (data ?? []) as CharacterRow[],
      trackedCurrencyIds
    );
    const vaultItemIcons = wantsVaultIcons ? await resolveVaultItemIcons(supabase, withKills) : {};
    return NextResponse.json({
      canSeeAll,
      currencyIcons,
      vaultItemIcons,
      syncedSeasonId,
      myUserId: appUser.id,
      hasMochila: appUser.has_mochila ?? false,
      mochilaCount: appUser.mochila_count ?? 0,
      characters: withKills,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error inesperado";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
