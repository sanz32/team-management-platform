import Link from "next/link";
import { Coins, Gavel, KeyRound, ClipboardList, LogOut, MonitorSmartphone, Palette, Settings, Ticket, User, UserCog } from "lucide-react";
import { auth, signOut } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getCurrentAppUserId } from "@/lib/current-app-user";
import { classColor } from "@/lib/wow-classes";
import { capitalize } from "@/lib/format";
import { getPendingUpdate } from "@/lib/product-updates";
import { sortCharacters } from "@/lib/characters-sort";
import { ROLE_LABEL, ROLE_BG as ROLE_STYLES, ROLE_TEXT, ROLE_BG_IMAGE } from "@/lib/roles";
import MemberAvatar, { memberNameProps, type FrameNameStyle } from "@/app/(portal)/characters/MemberAvatar";
import NotificationBell from "./NotificationBell";
import GlobalSearch from "./GlobalSearch";
import NavDropdown from "./NavDropdown";
import NavLinks from "./NavLinks";
import UpdateModal from "./UpdateModal";

export default async function NavBar() {
  const session = await auth();
  const appRole = session?.user?.appRole;
  const nickname = session?.user?.nickname;
  const discordId = session?.user?.discordId;
  const displayName = nickname || session?.user?.name;

  let mainCharacterClass: string | null = null;
  let mainCharacterName: string | null = null;
  if (discordId) {
    const supabase = createServerSupabaseClient();
    const { data: userCharacters } = await supabase
      .from("characters")
      .select("id, name, class, ilvl, sort_order, app_users!inner(discord_id)")
      .eq("app_users.discord_id", discordId);
    const main = userCharacters && userCharacters.length > 0 ? sortCharacters(userCharacters)[0] : null;
    mainCharacterClass = main?.class ?? null;
    mainCharacterName = main?.name ?? null;
  }

  const avatarRing = classColor(mainCharacterClass);
  const avatarTitle =
    mainCharacterName && mainCharacterClass
      ? `${capitalize(mainCharacterName)} (${mainCharacterClass})`
      : (mainCharacterClass ?? undefined);
  const initial = displayName?.charAt(0)?.toUpperCase() ?? "?";
  const avatarUrl = session?.user?.image ?? null;

  let pendingUpdate: Awaited<ReturnType<typeof getPendingUpdate>> = null;
  if (discordId) {
    const supabase = createServerSupabaseClient();
    const { data: appUser } = await supabase
      .from("app_users")
      .select("dismissed_update_id, visited_update_id")
      .eq("discord_id", discordId)
      .maybeSingle();

    if (appUser) {
      pendingUpdate = await getPendingUpdate(supabase, appUser);
    }
  }

  let hasApp = false;
  let frameColor1: string | null = null;
  let frameColor2: string | null = null;
  let frameNameStyle: string | null = null;
  if (discordId) {
    const supabase = createServerSupabaseClient();
    const appUserId = await getCurrentAppUserId(supabase, session?.user);
    if (appUserId) {
      const [{ data: prefs }, { data: token }] = await Promise.all([
        supabase
          .from("app_users")
          .select("frame_color_1, frame_color_2, frame_name_style")
          .eq("id", appUserId)
          .maybeSingle(),
        supabase.from("sync_tokens").select("user_id").eq("user_id", appUserId).maybeSingle(),
      ]);
      frameColor1 = prefs?.frame_color_1 ?? null;
      frameColor2 = prefs?.frame_color_2 ?? null;
      frameNameStyle = prefs?.frame_name_style ?? null;
      hasApp = Boolean(token);
    }
  }
  const navNameProps = memberNameProps(hasApp, frameNameStyle as FrameNameStyle | null, frameColor1, frameColor2);

  return (
    <nav className="sticky top-0 z-40 backdrop-blur-xl bg-canvas/80 border-b border-line relative">
      <div
        className="absolute bottom-0 left-0 right-0 h-px"
        style={{ background: "linear-gradient(90deg, var(--color-primary), transparent 45%, transparent 55%, var(--color-secondary))" }}
        aria-hidden
      />
      <div className="portal-container is-wide py-4 flex items-center gap-6">
        <Link href="/" className="flex items-center gap-2.5 shrink-0 group">
          <span
            className="w-8 h-8 rounded-md shrink-0 flex items-center justify-center transition-transform group-hover:scale-105"
            style={{ border: "1px solid var(--color-line-strong)", backgroundColor: "var(--color-surface-2)" }}
          >
            <svg viewBox="0 0 100 100" className="w-6 h-6" aria-hidden>
              <defs>
                <linearGradient id="navbar-logo-grad" x1="0" y1="1" x2="1" y2="0">
                  <stop offset="0" stopColor="var(--color-primary-deep)" />
                  <stop offset="1" stopColor="var(--color-primary-hover)" />
                </linearGradient>
              </defs>
              <g stroke="url(#navbar-logo-grad)" strokeWidth="10" strokeLinecap="round" fill="none">
                <path d="M50,50 L50.5,25" transform="rotate(0 50 50)" />
<circle cx="50" cy="22" r="6" transform="rotate(0 50 50)" />
                <path d="M50,50 L50.5,25" transform="rotate(120 50 50)" />
<circle cx="50" cy="22" r="6" transform="rotate(120 50 50)" />
                <path d="M50,50 L50.5,25" transform="rotate(240 50 50)" />
<circle cx="50" cy="22" r="6" transform="rotate(240 50 50)" />
              </g>
              <circle cx="50" cy="50" r="13" fill="#fff3e6" />
            </svg>
          </span>
          <span
            className="font-bold text-xl text-ink hidden sm:inline"
            style={{ fontFamily: "var(--font-display)", letterSpacing: "0.04em", fontWeight: 400 }}
          >
            Team Portal
          </span>
        </Link>

        <div className="nav-links-slot flex-1 flex justify-center min-w-0">
          <NavLinks
            badgePath={pendingUpdate?.showBadge ? pendingUpdate.featurePath : null}
            badgeUpdateId={pendingUpdate?.showBadge ? pendingUpdate.id : null}
            appRole={appRole}
          />
        </div>

        <div className="flex items-center gap-3 text-sm shrink-0">
          <GlobalSearch appRole={appRole} />
          <NotificationBell />
          <NavDropdown
            align="right"
            triggerClassName="nav-slot nav-identity"
            label={
              <span className="hidden lg:flex flex-col items-start gap-1 min-w-0">
                <span
                  className={`font-heading font-semibold text-[0.95rem] leading-none tracking-tight truncate max-w-[13rem] ${navNameProps?.className ?? "text-ink"}`}
                  style={navNameProps?.style}
                >
                  {displayName}
                </span>
                {appRole && (
                  <span
                    className="nav-rank"
                    style={{
                      backgroundColor: ROLE_STYLES[appRole] ?? ROLE_STYLES.member,
                      backgroundImage: ROLE_BG_IMAGE[appRole],
                      color: ROLE_TEXT[appRole] ?? ROLE_TEXT.member,
                    }}
                  >
                    {ROLE_LABEL[appRole] ?? appRole}
                  </span>
                )}
              </span>
            }
            icon={
              hasApp ? (
                <MemberAvatar
                  group={{ user_id: discordId ?? "navbar", discord_username: displayName ?? "?", avatar_url: avatarUrl }}
                  size={40}
                  hasApp
                  accent1={frameColor1}
                  accent2={frameColor2}
                />
              ) : avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarUrl}
                  alt={displayName ?? "Avatar"}
                  width={40}
                  height={40}
                  className="w-10 h-10 rounded-full shrink-0 object-cover"
                  style={{ border: `2px solid ${avatarRing}` }}
                  title={avatarTitle}
                />
              ) : (
                <span
                  className="w-10 h-10 rounded-full flex items-center justify-center font-heading text-base font-bold text-ink shrink-0"
                  style={{
                    background: "linear-gradient(135deg, var(--color-surface-2), var(--color-surface))",
                    border: `2px solid ${avatarRing}`,
                  }}
                  title={avatarTitle}
                >
                  {initial}
                </span>
              )
            }
          >
            <Link href="/characters" className="nav-dropdown-item">
              <User className="w-4 h-4" />
              Perfil
            </Link>
            {(appRole === "admin" || appRole === "manager") && (
              <>
                <p className="text-caption !text-ink-faint px-2.5 pt-2 pb-1">Configuración</p>
                <Link href="/admin/import-balance" className="nav-dropdown-item">
                  <ClipboardList className="w-4 h-4" />
                  Importar Balance
                </Link>
                <Link href="/configuracion" className="nav-dropdown-item">
                  <Settings className="w-4 h-4" />
                  Temporada
                </Link>
              </>
            )}
            {(appRole === "admin" || appRole === "manager") && (
              <Link href="/miembros" className="nav-dropdown-item">
                <UserCog className="w-4 h-4" />
                Miembros
              </Link>
            )}
            {appRole === "admin" && (
              <Link href="/cuentas" className="nav-dropdown-item">
                <KeyRound className="w-4 h-4" />
                Cuentas
              </Link>
            )}
            {appRole !== "guest" && appRole !== "friend" && (
              <Link href="/binance" className="nav-dropdown-item">
                <Coins className="w-4 h-4" />
                Binance
              </Link>
            )}
            {appRole !== "guest" && appRole !== "friend" && (
              <Link href="/puntos" className="nav-dropdown-item">
                <Gavel className="w-4 h-4" />
                Puntos
              </Link>
            )}
            {appRole !== "guest" && appRole !== "friend" && (
              <Link href="/reservas" className="nav-dropdown-item">
                <Ticket className="w-4 h-4" />
                Reservas
              </Link>
            )}
            <Link href="/app" className="nav-dropdown-item">
              <MonitorSmartphone className="w-4 h-4" />
              App
            </Link>
            <Link href="/apariencia" className="nav-dropdown-item">
              <Palette className="w-4 h-4" />
              Apariencia
            </Link>
            <div className="my-1 border-t border-line" aria-hidden />
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/login" });
              }}
            >
              <button type="submit" className="nav-dropdown-item">
                <LogOut className="w-4 h-4" />
                Cerrar sesión
              </button>
            </form>
          </NavDropdown>
        </div>
      </div>
      {pendingUpdate?.showToast && (
        <UpdateModal
          updateId={pendingUpdate.id}
          title={pendingUpdate.title}
          message={pendingUpdate.message}
          featurePath={pendingUpdate.featurePath}
          imageUrl={pendingUpdate.imageUrl}
          createdAt={pendingUpdate.createdAt}
        />
      )}
    </nav>
  );
}
