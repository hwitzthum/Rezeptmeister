import { auth } from "@/auth";
import { NextResponse } from "next/server";

// Öffentliche Routen, die keine Anmeldung erfordern
const PUBLIC_ROUTES = [
  "/auth/anmelden",
  "/auth/registrieren",
  "/auth/warten",
  "/auth/fehler",
];

// Routen die öffentlich UND für eingeloggte Benutzer zugänglich sind
const OPEN_ROUTES = ["/offline"];

export default auth((req) => {
  const { nextUrl } = req;
  const isLoggedIn = !!req.auth;

  // /api/auth/* routes handle their own authentication – pass through
  if (nextUrl.pathname.startsWith("/api/auth/")) {
    return NextResponse.next();
  }

  // /api/health is a public probe endpoint (uptime monitors, load balancers).
  // It deliberately exposes only an aggregate status, so it is safe to leave
  // reachable without a session.
  if (nextUrl.pathname === "/api/health") {
    return NextResponse.next();
  }

  // All other /api/* routes require a valid session
  if (nextUrl.pathname.startsWith("/api/")) {
    if (!isLoggedIn) {
      return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
    }
    return NextResponse.next();
  }

  // Statische Assets und Next.js-interne Routen durchlassen
  if (
    nextUrl.pathname.startsWith("/_next") ||
    nextUrl.pathname.startsWith("/favicon") ||
    nextUrl.pathname === "/manifest.webmanifest"
  ) {
    return NextResponse.next();
  }

  const isPublicRoute = PUBLIC_ROUTES.some((route) =>
    nextUrl.pathname.startsWith(route),
  );
  const isOpenRoute = OPEN_ROUTES.some((route) =>
    nextUrl.pathname.startsWith(route),
  );

  // Offene Routen sind immer zugänglich (eingeloggt oder nicht)
  if (isOpenRoute) {
    return NextResponse.next();
  }

  // Nicht angemeldet → zum Login umleiten
  if (!isLoggedIn && !isPublicRoute) {
    const loginUrl = new URL("/auth/anmelden", nextUrl);
    loginUrl.searchParams.set("callbackUrl", nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Bereits angemeldet → Login-Seite überspringen, weiter zu App
  if (isLoggedIn && isPublicRoute) {
    return NextResponse.redirect(new URL("/", nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  // Alle Routen ausser statischen Assets
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw\\.js|workbox-.*\\.js|icons/.*|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico)$).*)",
  ],
};
