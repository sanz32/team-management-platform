export interface RaidMatcher {
  id: string;
  name: string;
  abbr: string | null;
}

export interface OfferText {
  titleEn: string;
  descriptionEn?: string | null;
}

const RUIDO = new Set(["the", "of", "and"]);

function pistas(raid: RaidMatcher): string[] {
  const limpio = raid.name.toLowerCase().replace(/\s+/g, " ").trim();
  const palabras = limpio.split(" ").filter((p) => !RUIDO.has(p));
  const salida: string[] = [];

  const sinArticulo = palabras.join(" ");
  if (sinArticulo) salida.push(sinArticulo);
  if (palabras[0] && palabras[0] !== sinArticulo) salida.push(palabras[0]);

  const abbr = raid.abbr?.toLowerCase().trim();
  if (abbr) salida.push(abbr);

  return salida;
}

function mencionada(texto: string, raid: RaidMatcher): boolean {
  return pistas(raid).some((pista) => {
    const escapada = pista.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^a-z0-9])${escapada}([^a-z0-9]|$)`, "i").test(texto);
  });
}

export function raidsForOffer(raids: RaidMatcher[], offer: OfferText): RaidMatcher[] {
  const texto = `${offer.titleEn} ${offer.descriptionEn ?? ""}`.toLowerCase();
  return raids.filter((raid) => mencionada(texto, raid));
}
