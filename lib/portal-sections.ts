import {
  Home,
  Users,
  Wallet,
  CalendarDays,
  BarChart3,
  Swords,
  ListChecks,
  Gem,
  Trophy,
  Database,
  Laptop2,
  Link2,
  Palette,
  Coins,
  Settings,
  Gavel,
  ClipboardPaste,
  UsersRound,
  Ticket,
  Store,
  type LucideIcon,
} from "lucide-react";

export interface PortalSection {
  href: string;
  label: string;
  icon: LucideIcon;
  area: string;
  inNavBar: boolean;
  guestVisible: boolean;
  friendVisible: boolean;
  manageOnly?: boolean;
  adminOnly?: boolean;
}

export const PORTAL_SECTIONS: PortalSection[] = [
  { href: "/", label: "Inicio", icon: Home, area: "Portal", inNavBar: true, guestVisible: true, friendVisible: true },
  { href: "/characters", label: "Personajes", icon: Users, area: "Progresión", inNavBar: true, guestVisible: true, friendVisible: true },
  { href: "/datos-personajes", label: "Datos de los personajes", icon: Database, area: "Progresión", inNavBar: false, guestVisible: false, friendVisible: true },
  { href: "/balance", label: "Balance", icon: Wallet, area: "Economía", inNavBar: true, guestVisible: true, friendVisible: false },
  { href: "/dias-libres", label: "Días Libres", icon: CalendarDays, area: "Raid", inNavBar: true, guestVisible: false, friendVisible: false },
  { href: "/resumen-semanal", label: "Resumen Semanal", icon: BarChart3, area: "Economía", inNavBar: true, guestVisible: false, friendVisible: false },
  { href: "/runs-ob", label: "Runs OB", icon: Swords, area: "Economía", inNavBar: true, guestVisible: false, friendVisible: false },
  { href: "/roster", label: "Roster", icon: ListChecks, area: "Raid", inNavBar: true, guestVisible: true, friendVisible: false },
  { href: "/wishlist", label: "Wishlist", icon: Gem, area: "Raid", inNavBar: true, guestVisible: false, friendVisible: false },
  { href: "/grupos-miticos", label: "Grupos M+", icon: Trophy, area: "Raid", inNavBar: true, guestVisible: false, friendVisible: false },
  { href: "/puntos", label: "Puntos", icon: Gavel, area: "Disciplina", inNavBar: false, guestVisible: false, friendVisible: false },
  { href: "/reservas", label: "Reservas", icon: Ticket, area: "Ventas", inNavBar: false, guestVisible: false, friendVisible: false },
  { href: "/reservas/catalogo", label: "Catálogo de boosts", icon: Store, area: "Ventas", inNavBar: false, guestVisible: false, friendVisible: false, manageOnly: true },
  { href: "/balance/administrar", label: "Administrar balance", icon: Wallet, area: "Economía", inNavBar: false, guestVisible: true, friendVisible: false },
  { href: "/admin/import-balance", label: "Importar balance", icon: ClipboardPaste, area: "Economía", inNavBar: false, guestVisible: false, friendVisible: false, manageOnly: true },
  { href: "/app", label: "App / Addon", icon: Laptop2, area: "Tu cuenta", inNavBar: false, guestVisible: true, friendVisible: true },
  { href: "/apariencia", label: "Apariencia", icon: Palette, area: "Tu cuenta", inNavBar: false, guestVisible: true, friendVisible: true },
  { href: "/binance", label: "Binance", icon: Coins, area: "Tu cuenta", inNavBar: false, guestVisible: false, friendVisible: false },
  { href: "/cuentas", label: "Cuentas", icon: Link2, area: "Tu cuenta", inNavBar: false, guestVisible: false, friendVisible: false, adminOnly: true },
  { href: "/miembros", label: "Miembros", icon: UsersRound, area: "Gestión", inNavBar: false, guestVisible: false, friendVisible: false, manageOnly: true },
  { href: "/configuracion", label: "Configuración", icon: Settings, area: "Gestión", inNavBar: false, guestVisible: false, friendVisible: false, manageOnly: true },
];

export function sectionsForRole(appRole?: string): PortalSection[] {
  return PORTAL_SECTIONS.filter((s) => {
    if (appRole === "guest") return s.guestVisible;
    if (appRole === "friend") return s.friendVisible;
    if (s.adminOnly) return appRole === "admin";
    if (s.manageOnly) return appRole === "admin" || appRole === "manager";
    return true;
  });
}
