import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Link-only access gate for the family/pilot demo. Anyone without the
// ?token=... link (or the cookie it sets on first visit) is blocked —
// including direct API calls, since /api/generate triggers paid Gemini
// usage. Disabled automatically if SITE_ACCESS_TOKEN isn't set.
const COOKIE_NAME = "hair_mvp_access";
const BYPASS_PATHS = new Set(["/invite-only"]);

export function proxy(request: NextRequest) {
  const accessToken = process.env.SITE_ACCESS_TOKEN;
  if (!accessToken) return NextResponse.next();

  const { pathname, searchParams } = request.nextUrl;
  if (BYPASS_PATHS.has(pathname)) return NextResponse.next();

  if (request.cookies.get(COOKIE_NAME)?.value === accessToken) {
    return NextResponse.next();
  }

  if (searchParams.get("token") === accessToken) {
    const cleanUrl = request.nextUrl.clone();
    cleanUrl.searchParams.delete("token");
    const response = NextResponse.redirect(cleanUrl);
    response.cookies.set(COOKIE_NAME, accessToken, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
    });
    return response;
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "invite_only" }, { status: 401 });
  }

  const inviteUrl = request.nextUrl.clone();
  inviteUrl.pathname = "/invite-only";
  inviteUrl.search = "";
  return NextResponse.redirect(inviteUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
