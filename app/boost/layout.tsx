import type { Metadata } from "next";
import BoostLangProvider from "./BoostLangProvider";
import BoostChrome from "./BoostChrome";

export const metadata: Metadata = {
  title: {
    absolute: "WoW Raid Boosts",
    template: "%s · WoW Raid Boosts",
  },
  description:
    "Raid boosting run by an actual raiding guild. Normal, Heroic and Mythic packages, paid in in-game gold.",
  openGraph: {
    title: "WoW Raid Boosts",
    description:
      "Raid boosting run by an actual raiding guild. Normal, Heroic and Mythic packages, paid in in-game gold.",
    images: ["/brand/banner.svg"],
  },
};

export default function BoostLayout({ children }: { children: React.ReactNode }) {
  return (
    <BoostLangProvider>
      <BoostChrome>{children}</BoostChrome>
    </BoostLangProvider>
  );
}
