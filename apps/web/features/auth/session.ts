import "server-only"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  sessionSecret,
  signSession,
  verifySession,
} from "./session-token"

export async function createSession(user: string) {
  const token = await signSession({ user }, sessionSecret())
  const store = await cookies()
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  })
}

export async function deleteSession() {
  const store = await cookies()
  store.delete(SESSION_COOKIE)
}

export async function getSession() {
  const store = await cookies()
  return verifySession(store.get(SESSION_COOKIE)?.value, sessionSecret())
}

/**
 * The real check. The proxy only redirects early; every page and server
 * action that touches data calls this.
 */
export async function requireSession() {
  const session = await getSession()
  if (!session) redirect("/login")
  return session
}
