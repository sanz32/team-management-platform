import fixture from "@/lib/test-utils/guild-fixture.json";
import { deriveMainClasses } from "@/lib/main-classes";
import type { AutoGenerateInput, CharacterTier, RoleRequest } from "@/lib/roster-generator";

export interface FixtureCharacter {
  id: string;
  user_id: string;
  name: string;
  class: string | null;
  ilvl: number;
  role: string;
  specs: { name: string; role: string }[];
}

export const GUILD_CHARACTERS = fixture.characters as FixtureCharacter[];

export interface ScenarioOptions {
  tiers?: Record<string, CharacterTier>;
  savedIds?: Set<string>;
  dayOffUserIds?: Set<string>;
  mochilaUserIds?: Set<string>;
}

export function buildGuildScenario(
  roles: RoleRequest[],
  options: ScenarioOptions = {}
): AutoGenerateInput["suggestions"] {
  const { tiers = {}, savedIds, dayOffUserIds, mochilaUserIds } = options;

  const charsByUser = new Map<string, FixtureCharacter[]>();
  for (const c of GUILD_CHARACTERS) {
    const list = charsByUser.get(c.user_id) ?? [];
    list.push(c);
    charsByUser.set(c.user_id, list);
  }
  const mainsByUser = new Map(
    [...charsByUser].map(([userId, chars]) => [userId, deriveMainClasses(chars)])
  );

  const suggestions: AutoGenerateInput["suggestions"] = {};

  for (const roleReq of roles) {
    const byUser = new Map<string, AutoGenerateInput["suggestions"][string][number]>();

    for (const c of GUILD_CHARACTERS) {
      if (c.ilvl < roleReq.minIlvl) continue;
      if (tiers[c.id] === "excluido") continue;

      let offSpecName: string | undefined;
      if (c.role !== roleReq.role) {
        const off = (c.specs ?? []).slice(1).find((s) => s.role === roleReq.role);
        if (!off) continue;
        offSpecName = off.name;
      }

      const mains = mainsByUser.get(c.user_id) ?? [];
      const candidate = {
        id: c.id,
        user_id: c.user_id,
        name: c.name,
        realm_slug: "area-52",
        region: "us",
        ilvl: c.ilvl,
        class: c.class,
        active_spec: c.class,
        role: c.role,
        discord_username: c.user_id,
        isOffSpec: !!offSpecName,
        specUsed: offSpecName ?? c.class,
        hasMochila: mochilaUserIds?.has(c.user_id) ?? false,
        mochilaCount: 0,
        isMainClass: c.class ? mains.includes(c.class) : false,
        ownerMainClasses: mains,
        tier: (c.class ? tiers[c.id] ?? "normal" : "ultimo_recurso") as CharacterTier,
        isDayOff: dayOffUserIds?.has(c.user_id) ?? false,
        isSaved: savedIds ? savedIds.has(c.id) : null,
      };

      const existing = byUser.get(c.user_id);
      if (existing) existing.characters.push(candidate);
      else byUser.set(c.user_id, { user_id: c.user_id, discord_username: c.user_id, characters: [candidate] });
    }

    suggestions[roleReq.role] = [...byUser.values()];
  }

  return suggestions;
}

export const FULL_RAID_ROLES: RoleRequest[] = [
  { role: "tank", count: 2, minIlvl: 285 },
  { role: "heal", count: 4, minIlvl: 285 },
  { role: "dps", count: 12, minIlvl: 285 },
];
