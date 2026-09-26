import { jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE = "ycd_session";

export async function middleware(request: NextRequest) {
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
        return NextResponse.json({ error: "PASSWORD_CHANGE_REQUIRED" }, { status: 428 });
      }
      return NextResponse.redirect(new URL("/change-password", request.url));
    }

    return NextResponse.next();
  } catch {
    const response = NextResponse.redirect(new URL("/", request.url));
    response.cookies.delete(SESSION_COOKIE);
    return response;
  }
}

export const config = {
  matcher: ["/dashboard/:path*", "/api/secure/:path*"],
};
