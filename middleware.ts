import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { moduleForPath, hasModuleAccess } from "@/lib/permissions";

const COOKIE_NAME = "shoe_pos_session";
const secretKey = () =>
  new TextEncoder().encode(process.env.AUTH_SECRET || "dev-only-secret-change-me");

// /api/cron/* isn't "public" in the sense of being open to anyone — Vercel
// Cron calls it without a session cookie, so it's gated by its own
// CRON_SECRET check (lib/cron-auth.ts) instead of the login session.
const PUBLIC_PATHS = ["/login", "/setup", "/api/auth/login", "/api/auth/logout", "/api/setup", "/api/public", "/api/cron"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p)) || pathname.startsWith("/_next")) {
    return NextResponse.next();
  }

  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) {
    return redirectOrDeny(req);
  }

  try {
    const { payload } = await jwtVerify(token, secretKey());
    const role = payload.role as string;
    const permissions = payload.permissions;

    // /users, /settings, and /activity (page + relevant API) are admin-only
    // regardless of the permissions list. /api/settings GET stays open (see
    // its own route) since staff need it for printing receipts.
    if (pathname.startsWith("/users") || pathname.startsWith("/api/users")) {
      if (role !== "ADMIN") return forbid(req);
      return NextResponse.next();
    }
    if (pathname === "/settings" || pathname.startsWith("/settings/")) {
      if (role !== "ADMIN") return forbid(req);
      return NextResponse.next();
    }
    if (
      pathname === "/activity" ||
      pathname.startsWith("/activity/") ||
      pathname.startsWith("/api/activity")
    ) {
      if (role !== "ADMIN") return forbid(req);
      return NextResponse.next();
    }
    if (
      pathname === "/api-keys" ||
      pathname.startsWith("/api-keys/") ||
      pathname.startsWith("/api/api-keys")
    ) {
      if (role !== "ADMIN") return forbid(req);
      return NextResponse.next();
    }

    const moduleKey = moduleForPath(pathname);
    if (!hasModuleAccess(role, permissions, moduleKey)) {
      return forbid(req);
    }

    return NextResponse.next();
  } catch {
    return redirectOrDeny(req);
  }
}

function redirectOrDeny(req: NextRequest) {
  if (req.nextUrl.pathname.startsWith("/api")) {
    return NextResponse.json({ error: "Login required" }, { status: 401 });
  }
  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set("next", req.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

function forbid(req: NextRequest) {
  if (req.nextUrl.pathname.startsWith("/api")) {
    return NextResponse.json({ error: "You don't have access to this section" }, { status: 403 });
  }
  const url = new URL("/", req.url);
  url.searchParams.set("denied", "1");
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
