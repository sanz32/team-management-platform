import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { BOOST_SHOWCASE_TAG } from "@/lib/boost-store";
import {
  fetchJournalInstanceDetail,
  fetchEncounterBossImage,
} from "@/lib/blizzard-journal";
import { lookupBossIconUrl } from "@/lib/sims/raidbots-static";
import type { Difficulty } from "@/lib/raids";

const VALID_DIFFICULTIES: Difficulty[] = ["world", "normal", "heroic", "mythic"];

interface RaidConfigInput {
  instanceId: number;
  raidKey: string;
  abbr: string;
  color: string;
  colorClass: string;
  blizzardInstanceName: string;
  difficulties: Difficulty[];
  lockoutSource: "blizzard" | "wcl";
  forceWclManualRefresh: boolean;
  headerImageUrl: string | null;
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  if (session.user.appRole !== "admin" && session.user.appRole !== "manager") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const seasonName: string = typeof body?.seasonName === "string" ? body.seasonName.trim() : "";
  const raidConfigs: RaidConfigInput[] = Array.isArray(body?.raidConfigs) ? body.raidConfigs : [];

  if (!seasonName) {
    return NextResponse.json({ error: "Falta el nombre de la temporada." }, { status: 400 });
  }
  if (raidConfigs.length === 0) {
    return NextResponse.json({ error: "Elige al menos una raid para sincronizar." }, { status: 400 });
  }
  for (const cfg of raidConfigs) {
    if (!cfg.raidKey?.trim() || !cfg.abbr?.trim() || !cfg.color?.trim() || !cfg.colorClass?.trim()) {
      return NextResponse.json(
        { error: "Cada raid necesita clave, sigla, color y clase de color." },
        { status: 400 }
      );
    }
    if (!cfg.difficulties?.length || cfg.difficulties.some((d) => !VALID_DIFFICULTIES.includes(d))) {
      return NextResponse.json(
        { error: `${cfg.raidKey}: elige al menos una dificultad válida.` },
        { status: 400 }
      );
    }
    if (cfg.lockoutSource !== "blizzard" && cfg.lockoutSource !== "wcl") {
      return NextResponse.json({ error: `${cfg.raidKey}: fuente de lockout inválida.` }, { status: 400 });
    }
  }
  const uniqueKeys = new Set(raidConfigs.map((c) => c.raidKey.trim()));
  if (uniqueKeys.size !== raidConfigs.length) {
    return NextResponse.json({ error: "Las claves de raid deben ser únicas." }, { status: 400 });
  }

  try {
    const region = process.env.BLIZZARD_REGION || "us";
    const instances = await Promise.all(
      raidConfigs.map((cfg) => fetchJournalInstanceDetail(region, cfg.instanceId))
    );

    const notRaidWarnings = instances
      .filter((i) => !i.isRaid)
      .map((i) => `${i.name} no está categorizada como raid por Blizzard -- revisa que sea la correcta.`);

    const supabase = createServerSupabaseClient();

    const { data: previousSeasons } = await supabase.from("raid_seasons").select("id").eq("is_current", true);
    const previousSeasonIds = (previousSeasons ?? []).map((s) => s.id);
    if (previousSeasonIds.length > 0) {
      const { data: oldBosses } = await supabase.from("raid_bosses").select("id").in("season_id", previousSeasonIds);
      const oldBossIds = (oldBosses ?? []).map((b) => b.id);
      if (oldBossIds.length > 0) {
        const { data: oldUpgrades } = await supabase
          .from("character_wishlist_upgrades")
          .select("sim_id")
          .in("boss_id", oldBossIds);
        const oldSimIds = Array.from(new Set((oldUpgrades ?? []).map((u) => u.sim_id)));
        if (oldSimIds.length > 0) {
          await supabase.from("character_sims").delete().in("id", oldSimIds);
        }
      }
    }

    await supabase.from("raid_seasons").update({ is_current: false }).eq("is_current", true);

    const { data: season, error: seasonError } = await supabase
      .from("raid_seasons")
      .insert({
        name: seasonName,
        blizzard_journal_instance_id: instances[0].id,
        expansion_id: instances[0].expansionId,
        is_current: true,
        synced_at: new Date().toISOString(),
      })
      .select("id, name")
      .single();

    if (seasonError || !season) {
      throw new Error(seasonError?.message ?? "No se pudo crear la temporada.");
    }

    const seasonRaidRows = raidConfigs.map((cfg, index) => ({
      season_id: season.id,
      raid_key: cfg.raidKey.trim(),
      blizzard_journal_instance_id: cfg.instanceId,
      blizzard_instance_name: cfg.blizzardInstanceName.trim() || null,
      name: instances[index].name,
      abbr: cfg.abbr.trim(),
      color: cfg.color.trim(),
      color_class: cfg.colorClass.trim(),
      difficulties: cfg.difficulties,
      lockout_source: cfg.lockoutSource,
      force_wcl_manual_refresh: cfg.forceWclManualRefresh === true,
      header_image_url: cfg.headerImageUrl?.trim() || null,
      order_index: index + 1,
      synced_at: new Date().toISOString(),
    }));

    const { data: insertedSeasonRaids, error: seasonRaidsError } = await supabase
      .from("season_raids")
      .insert(seasonRaidRows)
      .select("id, raid_key, name, abbr");
    if (seasonRaidsError) throw new Error(seasonRaidsError.message);

    const seasonRaidIdByKey = new Map(
      (insertedSeasonRaids ?? []).map((r) => [r.raid_key as string, r.id as string])
    );

    let orderIndex = 0;
    const bossRows: {
      season_id: string;
      season_raid_id: string;
      journal_encounter_id: number;
      name: string;
      order_index: number;
      image_url: string | null;
      synced_at: string;
    }[] = [];

    instances.forEach((instance, index) => {
      const seasonRaidId = seasonRaidIdByKey.get(raidConfigs[index].raidKey.trim());
      if (!seasonRaidId) return;
      for (const encounter of instance.encounters) {
        orderIndex += 1;
        bossRows.push({
          season_id: season.id,
          season_raid_id: seasonRaidId,
          journal_encounter_id: encounter.id,
          name: encounter.name,
          order_index: orderIndex,
          image_url: null,
          synced_at: new Date().toISOString(),
        });
      }
    });

    const images = await Promise.all(
      bossRows.map(async (b) => {
        const fromRaidbots = await lookupBossIconUrl(b.journal_encounter_id);
        return fromRaidbots ?? (await fetchEncounterBossImage(region, b.journal_encounter_id));
      })
    );
    bossRows.forEach((b, idx) => {
      b.image_url = images[idx];
    });

    const { data: insertedBosses, error: bossesError } = await supabase
      .from("raid_bosses")
      .insert(bossRows)
      .select("id, journal_encounter_id, name, order_index, image_url");
    if (bossesError) throw new Error(bossesError.message);

    revalidateTag(BOOST_SHOWCASE_TAG, { expire: 0 });

    return NextResponse.json({
      season: { id: season.id, name: season.name },
      raids: insertedSeasonRaids ?? [],
      warnings: notRaidWarnings,
      bosses: (insertedBosses ?? [])
        .map((b) => ({
          id: b.id,
          name: b.name,
          orderIndex: b.order_index,
          imageUrl: b.image_url,
        }))
        .sort((a, b) => a.orderIndex - b.orderIndex),
    });
  } catch (err) {
    console.error("Error sincronizando temporada de Wishlist:", err);
    const message = err instanceof Error ? err.message : "Error desconocido sincronizando la temporada.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
