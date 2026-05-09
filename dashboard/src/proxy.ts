import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const publicRoutes = ["/login", "/api/session", "/api/auth/session", "/api/auth/session-login", "/api/auth/session-logout", "/api/auth/bridge", "/api/auth/github/callback"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Check if the route is public
  if (
    publicRoutes.includes(pathname) ||
    pathname.startsWith("/_next") ||
    pathname.includes("favicon.ico")
  ) {
    return NextResponse.next();
  }

  // 2. Check for the session cookie
  const session = request.cookies.get("__session")?.value;

  if (!session) {
    // No session found, redirect to login
    const loginUrl = new URL("/login", request.url);
    // Optionally preserve the current URL to redirect back after login
    // loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Session exists. We could verify it here if we were using Node.js,
  // but Next.js Edge Middleware doesn't support the full firebase-admin SDK.
  // Instead, the cookie presence is the coarse-grained check.
  // The client-side AuthProvider and server-side API routes will do fine-grained
  // token validation and role extraction.

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes) -> We let them handle their own auth
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
