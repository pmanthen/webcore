import NextAuth from "next-auth";
import { NextResponse } from "next/server";

import { authConfig } from "@/auth.config";

const { auth } = NextAuth(authConfig);

/**
 * Protect tenant-scoped UI and the evaluate API. Unauthenticated page
 * requests redirect to the default Auth.js sign-in page; API callers get 401.
 */
export default auth((req) => {
  if (req.auth) {
    return NextResponse.next();
  }

  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const signInUrl = new URL("/api/auth/signin", req.nextUrl.origin);
  signInUrl.searchParams.set("callbackUrl", req.nextUrl.href);
  return NextResponse.redirect(signInUrl);
});

export const config = {
  matcher: ["/projects/:path*", "/runs/:path*", "/api/evaluate"],
};
