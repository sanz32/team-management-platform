export interface KeystoneDungeon {
  mapId: number;
  abbr: string;
  name: string;
}

const DUNGEONS_BY_CHALLENGE_MODE: Record<number, KeystoneDungeon> = {
  161: { mapId: 1209, abbr: "SR", name: "Skyreach" },
  168: { mapId: 1279, abbr: "EB", name: "The Everbloom" },
  198: { mapId: 1466, abbr: "DHT", name: "Darkheart Thicket" },
  199: { mapId: 1501, abbr: "BRH", name: "Black Rook Hold" },
  206: { mapId: 1458, abbr: "NL", name: "Neltharion's Lair" },
  239: { mapId: 1753, abbr: "SEAT", name: "Seat of the Triumvirate" },
  244: { mapId: 1763, abbr: "AD", name: "Atal'Dazar" },
  245: { mapId: 1754, abbr: "FH", name: "Freehold" },
  247: { mapId: 1594, abbr: "ML", name: "The MOTHERLODE!!" },
  248: { mapId: 1862, abbr: "WM", name: "Waycrest Manor" },
  249: { mapId: 1762, abbr: "KR", name: "Kings' Rest" },
  250: { mapId: 1877, abbr: "TOS", name: "Temple of Sethraliss" },
  251: { mapId: 1841, abbr: "UNDR", name: "The Underrot" },
  353: { mapId: 1822, abbr: "SIEGE", name: "Siege of Boralus" },
  370: { mapId: 2097, abbr: "WORK", name: "Operation: Mechagon" },
  375: { mapId: 2290, abbr: "MISTS", name: "Mists of Tirna Scithe" },
  376: { mapId: 2286, abbr: "NW", name: "The Necrotic Wake" },
  378: { mapId: 2287, abbr: "HOA", name: "Halls of Atonement" },
  382: { mapId: 2293, abbr: "TOP", name: "Theater of Pain" },
  391: { mapId: 2441, abbr: "STRT", name: "Tazavesh: Streets of Wonder" },
  392: { mapId: 2441, abbr: "GMBT", name: "Tazavesh: So'leah's Gambit" },
  399: { mapId: 2521, abbr: "RLP", name: "Ruby Life Pools" },
  400: { mapId: 2516, abbr: "NO", name: "The Nokhud Offensive" },
  401: { mapId: 2515, abbr: "AV", name: "The Azure Vault" },
  402: { mapId: 2526, abbr: "AA", name: "Algeth'ar Academy" },
  403: { mapId: 2451, abbr: "ULD", name: "Uldaman: Legacy of Tyr" },
  404: { mapId: 2519, abbr: "NELT", name: "Neltharus" },
  405: { mapId: 2520, abbr: "BH", name: "Brackenhide Hollow" },
  406: { mapId: 2527, abbr: "HOI", name: "Halls of Infusion" },
  438: { mapId: 657, abbr: "VP", name: "The Vortex Pinnacle" },
  456: { mapId: 643, abbr: "TOTT", name: "Throne of the Tides" },
  463: { mapId: 2579, abbr: "FALL", name: "Dawn of the Infinite: Galakrond's Fall" },
  464: { mapId: 2579, abbr: "RISE", name: "Dawn of the Infinite: Murozond's Rise" },
  499: { mapId: 2649, abbr: "PSF", name: "Priory of the Sacred Flame" },
  500: { mapId: 2648, abbr: "ROOK", name: "The Rookery" },
  501: { mapId: 2652, abbr: "SV", name: "The Stonevault" },
  502: { mapId: 2669, abbr: "COT", name: "City of Threads" },
  503: { mapId: 2660, abbr: "ARAK", name: "Ara-Kara, City of Echoes" },
  504: { mapId: 2651, abbr: "DFC", name: "Darkflame Cleft" },
  505: { mapId: 2662, abbr: "DAWN", name: "The Dawnbreaker" },
  506: { mapId: 2661, abbr: "BREW", name: "Cinderbrew Meadery" },
  507: { mapId: 670, abbr: "GB", name: "Grim Batol" },
  525: { mapId: 2773, abbr: "FLOOD", name: "Operation: Floodgate" },
  542: { mapId: 2830, abbr: "EDA", name: "Eco-Dome Al'dani" },
  556: { mapId: 658, abbr: "POS", name: "Pit of Saron" },
  557: { mapId: 2805, abbr: "WS", name: "Windrunner Spire" },
  558: { mapId: 2811, abbr: "MT", name: "Magister's Terrace" },
  559: { mapId: 2915, abbr: "NPX", name: "Nexus-Point Xenas" },
  560: { mapId: 2874, abbr: "MC", name: "Maisara Caverns" },
  584: { mapId: 2859, abbr: "TBV", name: "The Blinding Vale" },
  585: { mapId: 2923, abbr: "VA", name: "Voidscar Arena" },
  586: { mapId: 2825, abbr: "DON", name: "Den of Nalorakk" },
  587: { mapId: 2813, abbr: "MR", name: "Murder Row" },
  588: { mapId: 2993, abbr: "AOF", name: "Altar of Fangs" },
};

const DUNGEONS_BY_MAP_ID: Record<number, KeystoneDungeon> = {};
for (const dungeon of Object.values(DUNGEONS_BY_CHALLENGE_MODE)) {
  if (!(dungeon.mapId in DUNGEONS_BY_MAP_ID)) DUNGEONS_BY_MAP_ID[dungeon.mapId] = dungeon;
}

export function findKeystoneDungeon(
  challengeModeID: number | null,
  mapId: number | null
): KeystoneDungeon | null {
  if (challengeModeID !== null) {
    const byChallengeMode = DUNGEONS_BY_CHALLENGE_MODE[challengeModeID];
    if (byChallengeMode) return byChallengeMode;
  }
  if (mapId !== null) {
    const byMapId = DUNGEONS_BY_MAP_ID[mapId];
    if (byMapId) return byMapId;
  }
  return null;
}
