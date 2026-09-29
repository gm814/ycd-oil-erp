import { jwtVerify } from "jose";
import { sameApplicationOrigin } from "@/lib/request-origin";
import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE = "ycd_session";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function sameOriginMutationAllowed(request: NextRequest) {
  if (!request.nextUrl.pathname.startsWith("/api/secure/") || SAFE_METHODS.has(request.method)) return true;

  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "cross-site") return false;

  const origin = request.headers.get("origin");
  if (!origin) return true;

  return sameApplicationOrigin(
    origin,
    request.nextUrl.origin,
    process.env.APP_ORIGIN || process.env.RENDER_EXTERNAL_URL,
  );
}

export async function middleware(request: NextRequest) {
  if (!sameOriginMutationAllowed(request)) {
    return NextResponse.json({ error: "CROSS_SITE_REQUEST_REJECTED" }, {
      status: 403,
      headers: { "cache-control": "no-store, max-age=0" },
    });
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const authSecret = process.env.AUTH_SECRET;

  if (!token || !authSecret) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(authSecret));
    const mustChangePassword = payload.mustChangePassword === true;
    const isPasswordChangeApi = request.nextUrl.pathname === "/api/secure/account/change-password";

    if (mustChangePassword && !isPasswordChangeApi) {
      if (request.nextUrl.pathname.startsWith("/api/secure/")) {
        return NextResponse.json({ error: "PASSWORD_CHANGE_REQUIRED" }, {
          status: 428,
          headers: { "cache-control": "no-store, max-age=0" },
        });
      }
      return NextResponse.redirect(new URL("/change-password", request.url));
    }

    const response = NextResponse.next();
    response.headers.set("cache-control", "no-store, max-age=0");
    return response;
  } catch {
    const response = NextResponse.redirect(new URL("/", request.url));
    response.cookies.delete(SESSION_COOKIE);
    response.headers.set("cache-control", "no-store, max-age=0");
    return response;
  }
}

export const config = {
  matcher: ["/dashboard/:path*", "/api/secure/:path*"],
};
