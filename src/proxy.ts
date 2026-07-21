import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "verifilab-session";

export function proxy(request: NextRequest) {
  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next();
  if (request.nextUrl.pathname.startsWith("/api/")) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = { matcher: ["/dashboard/:path*", "/api/:path*"] };
