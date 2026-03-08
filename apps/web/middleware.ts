import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // allow auth + internals
  if (pathname.startsWith("/login") || pathname.startsWith("/_next") || pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  // protect these areas
  const isProtected = pathname.startsWith("/dashboard") || pathname.startsWith("/projects");

  if (!isProtected) return NextResponse.next();

  const authed = !!req.cookies.get("gc_auth")?.value;
  if (!authed) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", "/dashboard"); // ✅ always go to dashboard after login
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/projects/:path*"],
};