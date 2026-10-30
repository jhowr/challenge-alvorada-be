import { NextResponse, type NextRequest } from "next/server"
import {
  SESSION_COOKIE,
  sessionSecret,
  verifySession,
} from "@/features/auth/session-token"

/**
 * Optimistic gate: sends visitors without a valid session to the login page
 * before any page renders. Pages and server actions still verify the session
 * themselves (requireSession), as the Next.js auth guide recommends.
 */
export async function proxy(request: NextRequest) {
  const session = await verifySession(
    request.cookies.get(SESSION_COOKIE)?.value,
    sessionSecret()
  )
  const { pathname, search } = request.nextUrl
  const onLogin = pathname === "/login"

  if (!session && !onLogin) {
    const url = new URL("/login", request.url)
    if (pathname !== "/") url.searchParams.set("next", pathname + search)
    return NextResponse.redirect(url)
  }
  if (session && onLogin) {
    return NextResponse.redirect(new URL("/", request.url))
  }
  return NextResponse.next()
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|ico)$).*)",
  ],
}
