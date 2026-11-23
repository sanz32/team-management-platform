import Link from "next/link";
import Script from "next/script";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { classColor, classBannerUrl, shortSpec } from "@/lib/wow-classes";
import { factionColor, factionLabel } from "@/lib/faction";
import { capitalize } from "@/lib/format";
import { readArmorySnapshot, refreshArmorySnapshot, EMPTY_STATS } from "@/lib/character-armory";
import RoleIcon from "../../../components/RoleIcon";
import TierSetBadge from "@/app/components/TierSetBadge";
import ArmoryPanel from "./ArmoryPanel";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createServerSupabaseClient();
  const { data } = await supabase
    .from("characters")
    .select("name, realm")
    .eq("id", id)
    .maybeSingle();

  if (!data?.name) return { title: "Personaje" };
  return { title: data.realm ? `${data.name} · ${capitalize(data.realm)}` : data.name };
}

export default async function CharacterDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { id } = await params;
  const { from } = await searchParams;
  const backHref = from === "admin" ? "/characters?view=admin" : "/characters";

  const session = await auth();
  if (!session?.user) {
    notFound();
  }

  const supabase = createServerSupabaseClient();
  const { data: character } = await supabase
    .from("characters")
    .select("*, app_users(discord_username, nickname)")
    .eq("id", id)
    .maybeSingle();

  if (!character) {
    notFound();
  }

  const ownerName =
    character.app_users?.nickname ?? character.app_users?.discord_username ?? "Desconocido";

  let armory = readArmorySnapshot(character);
  let liveError = "";

  if (!armory) {
    try {
      armory = await refreshArmorySnapshot(supabase, character);
    } catch (err) {
      liveError = "No se pudo consultar el Armory ahora mismo. Intenta de nuevo más tarde.";
      console.error("Error consultando Armory de personaje en Blizzard:", err);
    }
  }

  const color = classColor(character.class);
  const bannerUrl = classBannerUrl(character.class);
  const armoryUrl = `https://worldofwarcraft.blizzard.com/en-us/character/${character.region}/${character.realm_slug}/${character.name.toLowerCase()}`;

  return (
    <>
      <Script src="https://wow.zamimg.com/widgets/power.js" strategy="afterInteractive" />
      <main className="portal-container py-10">
        <Link
          href={backHref}
          className="text-ink-faint hover:text-ink text-sm transition-colors inline-flex items-center gap-1.5"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Volver a Personajes
        </Link>

        <div
          className="card p-6 mt-4 mb-6 relative overflow-hidden"
          style={{ borderLeft: `4px solid ${color}` }}
        >
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: bannerUrl
                ? `linear-gradient(90deg, rgba(11,14,21,0.75), rgba(11,14,21,0.35)), url(${bannerUrl})`
                : `linear-gradient(135deg, var(--color-surface-2), var(--color-surface))`,
              backgroundSize: "cover",
              backgroundPosition: "center top",
            }}
          />
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-display-xl text-ink">
                {capitalize(character.name)}
                <span className="text-ink-faint font-normal text-xl">-{character.realm_slug}</span>
              </h1>
              {factionLabel(character.faction) && (
                <p
                  className="text-xs font-bold uppercase tracking-wide mt-1"
                  style={{ color: factionColor(character.faction) }}
                >
                  {factionLabel(character.faction)}
                </p>
              )}
              <p className="text-sm mt-1.5 font-semibold" style={{ color }}>
                {shortSpec(character.class, character.active_spec)}
              </p>
              {character.specs && character.specs.length > 1 && (
                <p className="text-ink-faint text-xs mt-0.5">
                  Off-Spec:{" "}
                  {(character.specs as { name: string; role: string }[])
                    .slice(1)
                    .map((s) => shortSpec(character.class, s.name))
                    .join(", ")}
                </p>
              )}
              <p className="text-ink-faint text-xs mt-2">Personaje de {ownerName}</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <RoleIcon role={character.role} size={26} showLabel />
              </div>
              <div className="flex items-end gap-2">
                <div className="text-right">
                  <p className="text-ink-muted text-xs uppercase tracking-wide font-semibold">ilvl</p>
                  <span
                    className="font-heading text-3xl font-bold block"
                    style={{ color: "var(--color-gold)" }}
                  >
                    {character.ilvl ?? "-"}
                  </span>
                </div>
                <TierSetBadge
                  count={character.tier_piece_count}
                  sets={character.tier_pieces}
                  legacySetName={character.tier_set_name}
                  size="md"
                />
              </div>
              <a
                href={armoryUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary"
              >
                Ver en Armory
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          </div>
        </div>

        <ArmoryPanel
          characterId={character.id}
          classColor={color}
          initialEquipmentFound={armory?.equipmentFound ?? false}
          initialItems={armory?.items ?? []}
          initialStats={armory?.stats ?? EMPTY_STATS}
          initialRenderUrl={armory?.renderUrl ?? null}
          initialRace={armory?.race ?? null}
          initialGender={armory?.gender ?? null}
          initialUpdatedAt={armory?.updatedAt ?? null}
          initialError={liveError}
        />
      </main>
    </>
  );
}
