import { createServerSupabaseClient } from "@/lib/supabase-server";
import { Difficulty } from "@/lib/raids";

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

const WCL_TOKEN_URL = "https://www.warcraftlogs.com/oauth/token";
const WCL_CLIENT_GRAPHQL_URL = "https://www.warcraftlogs.com/api/v2/client";
const WCL_USER_GRAPHQL_URL = "https://www.warcraftlogs.com/api/v2/user";

export function getWclRedirectUri(): string {
  return `${process.env.NEXTAUTH_URL}/api/wcl/oauth/callback`;
}

export class WclNotFoundError extends Error {}
export class WclRateLimitError extends Error {}
export class WclReauthRequiredError extends Error {}

let cachedAppToken: { token: string; expiresAt: number } | null = null;

export async function getWclToken(forceRefresh = false): Promise<string> {
  if (!forceRefresh && cachedAppToken && cachedAppToken.expiresAt > Date.now()) {
    return cachedAppToken.token;
  }

  const clientId = process.env.WCL_CLIENT_ID!;
  const clientSecret = process.env.WCL_CLIENT_SECRET!;

  const res = await fetch(WCL_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) {
    throw new Error(`Error obteniendo token de Warcraft Logs: ${res.status}`);
  }

  const data = await res.json();
  cachedAppToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 300) * 1000,
  };

  return cachedAppToken.token;
}

interface WclConnectionRow {
  id: string;
  access_token: string;
  refresh_token: string;
  expires_at: string;
}

async function getLatestConnection(supabase: SupabaseClient): Promise<WclConnectionRow | null> {
  const { data } = await supabase
    .from("wcl_oauth_tokens")
    .select("id, access_token, refresh_token, expires_at")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data ?? null;
}

async function refreshUserConnection(
  supabase: SupabaseClient,
  connection: WclConnectionRow
): Promise<string> {
  const clientId = process.env.WCL_CLIENT_ID!;
  const clientSecret = process.env.WCL_CLIENT_SECRET!;

  const res = await fetch(WCL_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: connection.refresh_token,
    }).toString(),
  });

  if (!res.ok) {
    throw new WclReauthRequiredError(
      "La conexión con la cuenta de Warcraft Logs expiró o fue revocada. Reconéctala desde Cuentas."
    );
  }

  const data = await res.json();
  const expiresAt = new Date(Date.now() + (data.expires_in - 300) * 1000).toISOString();

  await supabase
    .from("wcl_oauth_tokens")
    .update({
      access_token: data.access_token,
      refresh_token: data.refresh_token ?? connection.refresh_token,
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", connection.id);

  return data.access_token;
}

interface WclAuthContext {
  token: string;
  endpoint: string;
}

async function getWclAuth(supabase: SupabaseClient, forceRefresh = false): Promise<WclAuthContext> {
  const connection = await getLatestConnection(supabase);

  if (connection) {
    const expired = forceRefresh || new Date(connection.expires_at).getTime() <= Date.now();
    const token = expired ? await refreshUserConnection(supabase, connection) : connection.access_token;
    return { token, endpoint: WCL_USER_GRAPHQL_URL };
  }

  const token = await getWclToken(forceRefresh);
  return { token, endpoint: WCL_CLIENT_GRAPHQL_URL };
}

export function extractReportCode(url: string): string | null {
  const match = url.trim().match(/warcraftlogs\.com\/reports\/([a-zA-Z0-9]+)/);
  return match ? match[1] : null;
}

export function extractFightId(url: string): number | null {
  const match = url.trim().match(/[?#&]fight=(\d+)/);
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export interface WclFightLinkParts {
  reportCode: string | null;
  fightId: number | null;
}

export function parseWclFightLink(url: string): WclFightLinkParts {
  return { reportCode: extractReportCode(url), fightId: extractFightId(url) };
}

export interface WclResolvedFight {
  reportCode: string;
  fightId: number;
  bossName: string;
  kill: boolean | null;
  difficulty: number | null;
  startTime: number;
}

export async function resolveWclFightFromLink(
  supabase: SupabaseClient,
  url: string
): Promise<WclResolvedFight> {
  const { reportCode, fightId } = parseWclFightLink(url);

  if (!reportCode) {
    throw new WclNotFoundError("Ese link no parece un reporte de Warcraft Logs.");
  }
  if (fightId === null) {
    throw new WclNotFoundError(
      "El link no señala ningún pull. Abre el pull en Warcraft Logs y copia el link con #fight= incluido."
    );
  }

  const overview = await getReportOverview(supabase, reportCode);
  const fight = overview.fights.find((f) => f.id === fightId);

  if (!fight) {
    throw new WclNotFoundError("Ese pull no existe en el reporte (puede ser trash, no un jefe).");
  }

  return {
    reportCode,
    fightId,
    bossName: fight.bossName,
    kill: fight.kill,
    difficulty: fight.difficulty,
    startTime: fight.startTime,
  };
}

export interface WclResolvedReportSummary {
  reportCode: string;
  bossCount: number;
  startTime: number | null;
}

export type WclResolvedLink = ({ kind: "fight" } & WclResolvedFight) | ({ kind: "report" } & WclResolvedReportSummary);

export async function resolveWclLink(supabase: SupabaseClient, url: string): Promise<WclResolvedLink> {
  const { reportCode, fightId } = parseWclFightLink(url);

  if (!reportCode) {
    throw new WclNotFoundError("Ese link no parece un reporte de Warcraft Logs.");
  }

  if (fightId !== null) {
    const fight = await resolveWclFightFromLink(supabase, url);
    return { kind: "fight", ...fight };
  }

  const overview = await getReportOverview(supabase, reportCode);
  if (overview.fights.length === 0) {
    throw new WclNotFoundError("Ese reporte no tiene ninguna pelea de jefe registrada.");
  }

  return {
    kind: "report",
    reportCode,
    bossCount: new Set(overview.fights.map((f) => f.bossName)).size,
    startTime: overview.startTime,
  };
}

export interface WclActor {
  name: string;
  server: string | null;
  subType: string | null;
  gameId: number | null;
}

const DIFFICULTY_LABELS: Record<number, string> = {
  3: "Normal",
  4: "Heroico",
  5: "Mítico",
};

export function difficultyLabel(difficulty: number | null): string {
  if (difficulty === null) return "-";
  return DIFFICULTY_LABELS[difficulty] ?? `Dificultad ${difficulty}`;
}

export function wclDifficultyToRaidDifficulty(difficulty: number | null): Difficulty | null {
  if (difficulty === 3) return "normal";
  if (difficulty === 4) return "heroic";
  if (difficulty === 5) return "mythic";
  return null;
}

export interface WclPhaseTransition {
  ms: number;
  isIntermission: boolean;
}

export interface WclFight {
  id: number;
  bossName: string;
  encounterId: number;
  difficulty: number | null;
  kill: boolean | null;
  startTime: number;
  endTime: number;
  bossPercentage: number | null;
  phaseTransitions: WclPhaseTransition[];
}

export interface WclReportOverview {
  code: string;
  title: string | null;
  zoneName: string | null;
  guildName: string | null;
  startTime: number | null;
  fights: WclFight[];
}

const REPORT_OVERVIEW_QUERY = `
  query GetReportOverview($code: String!) {
    reportData {
      report(code: $code) {
        title
        startTime
        zone {
          name
        }
        guild {
          name
        }
        phases {
          encounterID
          phases {
            id
            isIntermission
          }
        }
        fights {
          id
          name
          encounterID
          difficulty
          kill
          startTime
          endTime
          bossPercentage
          phaseTransitions {
            id
            startTime
          }
        }
      }
    }
  }
`;

export interface WclGuildReportFight {
  id: number;
  encounterID: number;
  difficulty: number | null;
  kill: boolean | null;
}

export interface WclGuildReport {
  code: string;
  fights: WclGuildReportFight[];
}

const GUILD_REPORTS_QUERY = `
  query GetGuildReports($guildID: Int!, $startTime: Float!, $endTime: Float!, $page: Int!) {
    reportData {
      reports(guildID: $guildID, startTime: $startTime, endTime: $endTime, page: $page, limit: 25) {
        data {
          code
          fights {
            id
            encounterID
            difficulty
            kill
          }
        }
        has_more_pages
      }
    }
  }
`;

export interface WclDungeonReportFight {
  id: number;
  name: string | null;
  keystoneLevel: number | null;
  keystoneTime: number | null;
  keystoneAffixes: number[] | null;
  keystoneBonus: number | null;
  averageItemLevel: number | null;
  startTime: number;
  endTime: number;
}

export interface WclDungeonReport {
  code: string;
  startTime: number;
  fights: WclDungeonReportFight[];
}

const GUILD_DUNGEON_REPORTS_QUERY = `
  query GetGuildDungeonReports($guildID: Int!, $startTime: Float!, $endTime: Float!, $page: Int!) {
    reportData {
      reports(guildID: $guildID, startTime: $startTime, endTime: $endTime, page: $page, limit: 25) {
        data {
          code
          startTime
          fights {
            id
            name
            keystoneLevel
            keystoneTime
            keystoneAffixes
            keystoneBonus
            averageItemLevel
            startTime
            endTime
          }
        }
        has_more_pages
      }
    }
  }
`;

export async function getGuildDungeonReportsInRange(
  supabase: SupabaseClient,
  guildId: number,
  startTime: number,
  endTime: number
): Promise<WclDungeonReport[]> {
  const reports: WclDungeonReport[] = [];
  let page = 1;

  for (;;) {
    const json = await wclGraphQLFetch(supabase, GUILD_DUNGEON_REPORTS_QUERY, {
      guildID: guildId,
      startTime,
      endTime,
      page,
    });
    const pagination = json.data?.reportData?.reports;
    if (!pagination) {
      throw new Error("No se pudo consultar los reportes de mazmorras del guild en Warcraft Logs.");
    }

    reports.push(...((pagination.data ?? []) as WclDungeonReport[]));
    if (!pagination.has_more_pages) break;
    page += 1;
  }

  return reports;
}

const PLAYER_DETAILS_QUERY = `
  query GetPlayerDetails($code: String!, $fightIDs: [Int]) {
    reportData {
      report(code: $code) {
        playerDetails(fightIDs: $fightIDs)
      }
    }
  }
`;

function castEventsQuery(hostility: "Enemies" | "Friendlies"): string {
  return `
    query GetCastEvents($code: String!, $startTime: Float!, $endTime: Float!, $filterExpression: String) {
      reportData {
        report(code: $code) {
          events(startTime: $startTime, endTime: $endTime, hostilityType: ${hostility}, dataType: Casts, filterExpression: $filterExpression, limit: 10000) {
            data
            nextPageTimestamp
          }
        }
      }
    }
  `;
}

const ACTORS_QUERY = `
  query GetActors($code: String!) {
    reportData {
      report(code: $code) {
        masterData {
          actors(type: "Player") {
            id
            name
            type
            subType
            server
          }
        }
      }
    }
  }
`;

const ABILITIES_QUERY = `
  query GetAbilities($code: String!) {
    reportData {
      report(code: $code) {
        masterData {
          abilities {
            gameID
            name
          }
        }
      }
    }
  }
`;

async function wclGraphQLFetch(
  supabase: SupabaseClient,
  query: string,
  variables: Record<string, unknown>
) {
  let auth = await getWclAuth(supabase);

  let res = await fetch(auth.endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${auth.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });

  if (res.status === 401) {
    auth = await getWclAuth(supabase, true);
    res = await fetch(auth.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${auth.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
    });
  }

  if (res.status === 429) {
    throw new WclRateLimitError(
      "Se alcanzo el limite de requests de Warcraft Logs. Intenta de nuevo en unos minutos."
    );
  }

  if (!res.ok) {
    throw new Error(`Error consultando Warcraft Logs: ${res.status}`);
  }

  return res.json();
}

interface RawWclFight {
  id: number;
  name: string;
  encounterID: number;
  difficulty: number | null;
  kill: boolean | null;
  startTime: number;
  endTime: number;
  bossPercentage: number | null;
  phaseTransitions: { id: number; startTime: number }[] | null;
}

interface RawEncounterPhases {
  encounterID: number;
  phases: { id: number; isIntermission: boolean | null }[];
}

export async function getReportOverview(
  supabase: SupabaseClient,
  reportCode: string
): Promise<WclReportOverview> {
  const json = await wclGraphQLFetch(supabase, REPORT_OVERVIEW_QUERY, { code: reportCode });
  const report = json.data?.reportData?.report;

  if (!report) {
    throw new WclNotFoundError(
      "No se encontro ese reporte en Warcraft Logs (puede ser privado o el link estar mal)."
    );
  }

  const reportStart: number = report.startTime ?? 0;

  const phasesByEncounter = new Map<number, Map<number, boolean>>();
  for (const encounterPhases of (report.phases ?? []) as RawEncounterPhases[]) {
    const byId = new Map<number, boolean>();
    for (const phase of encounterPhases.phases) {
      byId.set(phase.id, phase.isIntermission ?? false);
    }
    phasesByEncounter.set(encounterPhases.encounterID, byId);
  }

  const fights: WclFight[] = ((report.fights ?? []) as RawWclFight[])
    .filter((f) => f.encounterID !== 0)
    .map((f) => {
      const intermissionById = phasesByEncounter.get(f.encounterID);
      const phaseTransitions: WclPhaseTransition[] = (f.phaseTransitions ?? []).map((t) => ({
        ms: reportStart + t.startTime,
        isIntermission: intermissionById?.get(t.id) ?? false,
      }));
      return {
        id: f.id,
        bossName: f.name,
        encounterId: f.encounterID,
        difficulty: f.difficulty,
        kill: f.kill,
        startTime: reportStart + f.startTime,
        endTime: reportStart + f.endTime,
        bossPercentage: f.bossPercentage,
        phaseTransitions,
      };
    });

  return {
    code: reportCode,
    title: report.title ?? null,
    zoneName: report.zone?.name ?? null,
    guildName: report.guild?.name ?? null,
    startTime: report.startTime ?? null,
    fights,
  };
}

export async function getGuildReportsInRange(
  supabase: SupabaseClient,
  guildId: number,
  startTime: number,
  endTime: number
): Promise<WclGuildReport[]> {
  const reports: WclGuildReport[] = [];
  let page = 1;

  for (;;) {
    const json = await wclGraphQLFetch(supabase, GUILD_REPORTS_QUERY, {
      guildID: guildId,
      startTime,
      endTime,
      page,
    });
    const pagination = json.data?.reportData?.reports;
    if (!pagination) {
      throw new Error("No se pudo consultar los reportes del guild en Warcraft Logs.");
    }

    reports.push(...((pagination.data ?? []) as WclGuildReport[]));
    if (!pagination.has_more_pages) break;
    page += 1;
  }

  return reports;
}

export async function getFightParticipants(
  supabase: SupabaseClient,
  reportCode: string,
  fightIds: number[]
): Promise<WclActor[]> {
  const json = await wclGraphQLFetch(supabase, PLAYER_DETAILS_QUERY, {
    code: reportCode,
    fightIDs: fightIds,
  });
  const report = json.data?.reportData?.report;

  if (!report) {
    throw new WclNotFoundError(
      "No se encontro ese reporte en Warcraft Logs (puede ser privado o el link estar mal)."
    );
  }

  const details = report.playerDetails?.data?.playerDetails ?? {};
  const groups: { name: string; server: string | null; type: string | null; guid?: number }[] = [
    ...(details.dps ?? []),
    ...(details.tanks ?? []),
    ...(details.healers ?? []),
  ];

  return groups.map((p) => ({
    name: p.name,
    server: p.server ?? null,
    subType: p.type ?? null,
    gameId: typeof p.guid === "number" ? p.guid : null,
  }));
}

export interface WclCastEvent {
  timestampMs: number;
  abilityGameId: number;
  sourceId: number;
}

interface RawCastEvent {
  timestamp: number;
  type: string;
  sourceID?: number;
  abilityGameID?: number;
}

export async function getFightCastEvents(
  supabase: SupabaseClient,
  reportCode: string,
  startTime: number,
  endTime: number,
  hostility: "Enemies" | "Friendlies",
  abilityIds?: number[]
): Promise<WclCastEvent[]> {
  if (abilityIds && abilityIds.length === 0) return [];

  const events: WclCastEvent[] = [];
  let cursor = startTime;
  const query = castEventsQuery(hostility);
  const filterExpression = abilityIds ? `ability.id in (${abilityIds.join(",")})` : null;

  for (;;) {
    const json = await wclGraphQLFetch(supabase, query, {
      code: reportCode,
      startTime: cursor,
      endTime,
      filterExpression,
    });
    const page = json.data?.reportData?.report?.events;
    if (!page) break;

    for (const raw of (page.data ?? []) as RawCastEvent[]) {
      if (raw.type !== "cast") continue;
      if (typeof raw.sourceID !== "number" || typeof raw.abilityGameID !== "number") continue;
      events.push({ timestampMs: raw.timestamp, abilityGameId: raw.abilityGameID, sourceId: raw.sourceID });
    }

    const next = page.nextPageTimestamp;
    if (typeof next !== "number" || next <= cursor || next >= endTime) break;
    cursor = next;
  }

  return events;
}

export interface WclActorWithSpec {
  id: number;
  name: string;
  class: string;
  spec: string | null;
}

export async function getFightActorsWithSpecs(
  supabase: SupabaseClient,
  reportCode: string,
  fightId: number
): Promise<WclActorWithSpec[]> {
  const [actorsJson, detailsJson] = await Promise.all([
    wclGraphQLFetch(supabase, ACTORS_QUERY, { code: reportCode }),
    wclGraphQLFetch(supabase, PLAYER_DETAILS_QUERY, { code: reportCode, fightIDs: [fightId] }),
  ]);

  const actors: { id: number; name: string; type: string; subType: string | null }[] =
    actorsJson.data?.reportData?.report?.masterData?.actors ?? [];

  const details = detailsJson.data?.reportData?.report?.playerDetails?.data?.playerDetails ?? {};
  const detailGroups: { id?: number; icon?: string }[] = [
    ...(details.dps ?? []),
    ...(details.tanks ?? []),
    ...(details.healers ?? []),
  ];
  const specById = new Map<number, string>();
  for (const d of detailGroups) {
    if (typeof d.id !== "number" || !d.icon) continue;
    const spec = d.icon.split("-")[1];
    if (spec) specById.set(d.id, spec);
  }

  return actors
    .filter((a) => a.type === "Player" && a.subType)
    .map((a) => ({
      id: a.id,
      name: a.name,
      class: a.subType as string,
      spec: specById.get(a.id) ?? null,
    }));
}

export async function getReportAbilityNames(
  supabase: SupabaseClient,
  reportCode: string
): Promise<Map<number, string>> {
  const json = await wclGraphQLFetch(supabase, ABILITIES_QUERY, { code: reportCode });
  const abilities: { gameID: number; name: string }[] = json.data?.reportData?.report?.masterData?.abilities ?? [];
  return new Map(abilities.map((a) => [a.gameID, a.name]));
}

const DIACRITICS_RANGE = new RegExp(
  "[" + String.fromCharCode(0x0300) + "-" + String.fromCharCode(0x036f) + "]",
  "g"
);
const APOSTROPHES = /['’]/g;

export function normalizeName(name: string): string {
  return name.normalize("NFD").replace(DIACRITICS_RANGE, "").replace(APOSTROPHES, "").trim().toLowerCase();
}

export function foldRealmForMatch(realm: string): string {
  return realm
    .normalize("NFD")
    .replace(DIACRITICS_RANGE, "")
    .replace(APOSTROPHES, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export interface MatchStats {
  byGameId: number;
  byExactName: number;
  byFoldedName: number;
  unmatched: number;
}

export interface GuildCharacterRef {
  id: string;
  name: string;
  realm_slug: string;
  blizzard_character_id?: number | null;
}

function exactNameKey(name: string, realm: string): string {
  return `${name.trim().normalize("NFC").toLowerCase()}@${foldRealmForMatch(realm)}`;
}

export function matchActorsToCharacters(
  actors: WclActor[],
  characters: GuildCharacterRef[]
): { matchedIds: Set<string>; unknownActors: WclActor[]; stats: MatchStats } {
  const byGameId = new Map<number, string>();
  const exactByKey = new Map<string, string>();
  const foldedByKey = new Map<string, string[]>();

  for (const c of characters) {
    if (typeof c.blizzard_character_id === "number") {
      byGameId.set(c.blizzard_character_id, c.id);
    }
    exactByKey.set(exactNameKey(c.name, c.realm_slug), c.id);
    const foldedKey = `${normalizeName(c.name)}@${foldRealmForMatch(c.realm_slug)}`;
    const bucket = foldedByKey.get(foldedKey);
    if (bucket) bucket.push(c.id);
    else foldedByKey.set(foldedKey, [c.id]);
  }

  const matchedIds = new Set<string>();
  const unknownActors: WclActor[] = [];
  const stats: MatchStats = { byGameId: 0, byExactName: 0, byFoldedName: 0, unmatched: 0 };

  for (const actor of actors) {
    if (actor.gameId !== null) {
      const byId = byGameId.get(actor.gameId);
      if (byId) {
        matchedIds.add(byId);
        stats.byGameId++;
        continue;
      }
    }

    if (!actor.server) {
      unknownActors.push(actor);
      stats.unmatched++;
      continue;
    }

    const exactId = exactByKey.get(exactNameKey(actor.name, actor.server));
    if (exactId) {
      matchedIds.add(exactId);
      stats.byExactName++;
      continue;
    }

    const foldedKey = `${normalizeName(actor.name)}@${foldRealmForMatch(actor.server)}`;
    const bucket = foldedByKey.get(foldedKey);
    if (bucket && bucket.length > 0) {
      for (const id of bucket) matchedIds.add(id);
      stats.byFoldedName++;
    } else {
      unknownActors.push(actor);
      stats.unmatched++;
    }
  }

  return { matchedIds, unknownActors, stats };
}
