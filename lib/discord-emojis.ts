const CLASS_EMOJIS: Record<string, string> = {
  Warrior: "<:warrior:100000000000000001>",
  Paladin: "<:paladin:100000000000000002>",
  Hunter: "<:hunter:100000000000000003>",
  Rogue: "<:rogue:100000000000000004>",
  Priest: "<:priest:100000000000000005>",
  "Death Knight": "<:deathknight:100000000000000006>",
  Shaman: "<:shaman:100000000000000007>",
  Mage: "<:mage:100000000000000008>",
  Warlock: "<:warlock:100000000000000009>",
  Monk: "<:monk:100000000000000010>",
  Druid: "<:druid:100000000000000011>",
  "Demon Hunter": "<:demonhunter:100000000000000012>",
  Evoker: "<:evoker:100000000000000013>",
};

export function classEmoji(className: string | null | undefined): string {
  if (!className) return "";
  return CLASS_EMOJIS[className] ?? "";
}
