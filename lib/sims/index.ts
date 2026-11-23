import { raidbotsProvider } from "./raidbots";
import { qeliveProvider } from "./qelive";
import { SimProviderImpl } from "./types";

export * from "./types";

const PROVIDERS: SimProviderImpl[] = [raidbotsProvider, qeliveProvider];

export class UnknownSimProviderError extends Error {}

export function detectSimProvider(input: string): SimProviderImpl {
  const provider = PROVIDERS.find((p) => p.detect(input));
  if (!provider) {
    throw new UnknownSimProviderError(
      "No reconocemos ese link, debe ser de Raidbots (raidbots.com) o QE Live (questionablyepic.com)."
    );
  }
  return provider;
}
