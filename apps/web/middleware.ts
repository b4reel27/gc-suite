import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const token = request.cookies.get("gc_token")?.value;

  const { pathname } = request.nextUrl;

  // allow login page
  if (pathname.startsWith("/login")) {
    return NextResponse.next();
  }

  // if no token redirect to login
  if (!token) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/projects/:path*",
  ],
};