import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export const proxy = auth((req) => {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/dev-login") && process.env.NODE_ENV !== "production") {
    return NextResponse.next();
  }

  const isLoggedIn = !!req.auth;

  if (!isLoggedIn) {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    return NextResponse.redirect(loginUrl);
  }

  const isApiRoute = pathname.startsWith("/api/");
  const isOnboarding = pathname.startsWith("/onboarding/nickname");

  if (!isApiRoute) {
    const nickname = (req.auth?.user as { nickname?: string | null } | undefined)?.nickname;

    if (!nickname && !isOnboarding) {
      return NextResponse.redirect(new URL("/onboarding/nickname", req.nextUrl.origin));
    }

    if (nickname && isOnboarding) {
      return NextResponse.redirect(new URL("/", req.nextUrl.origin));
    }
  }

  if (!isApiRoute) {
    const appRole = (req.auth?.user as { appRole?: string } | undefined)?.appRole;
    const isGuestAllowedPath =
      pathname === "/" ||
      pathname.startsWith("/characters") ||
      pathname.startsWith("/roster") ||
      pathname.startsWith("/balance") ||
      pathname.startsWith("/onboarding/nickname") ||
      pathname.startsWith("/conectar-app") ||
      pathname.startsWith("/app") ||
      pathname.startsWith("/apariencia");

    if (appRole === "guest" && !isGuestAllowedPath) {
      return NextResponse.redirect(new URL("/", req.nextUrl.origin));
    }

    const isFriendAllowedPath =
      pathname === "/" ||
      pathname.startsWith("/characters") ||
      pathname.startsWith("/datos-personajes") ||
      pathname.startsWith("/onboarding/nickname") ||
      pathname.startsWith("/conectar-app") ||
      pathname.startsWith("/app") ||
      pathname.startsWith("/apariencia");

    if (appRole === "friend" && !isFriendAllowedPath) {
      return NextResponse.redirect(new URL("/", req.nextUrl.origin));
    }
  }

  if (
    pathname.startsWith("/cooldown-planner") ||
    pathname.startsWith("/api/cooldown-planner") ||
    pathname.startsWith("/api/admin/cooldown-planner")
  ) {
    if (isApiRoute) {
      return NextResponse.json({ error: "No disponible" }, { status: 404 });
    }
    return NextResponse.redirect(new URL("/", req.nextUrl.origin));
  }
});

export const config = {
  matcher: [
    "/((?!login|api/auth|api/cron|api/activity/break|api/sync/desktop|boost|api/boost|_next/static|_next/image|favicon.ico|icon.svg|brand/|changelog/|friends/).*)",
  ],
};
