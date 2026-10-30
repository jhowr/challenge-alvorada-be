import { jwtVerify, SignJWT } from "jose"

/**
 * The panel's session is a signed JWT in an httpOnly cookie. Login lives only
 * in Next: the API stays unauthenticated by design (docs/DECISIONS.md §3).
 * This module is pure so the proxy, the server and the tests share it.
 */
export const SESSION_COOKIE = "booking_session"
export const SESSION_TTL_SECONDS = 60 * 60 * 8

export interface SessionPayload {
  user: string
}

const DEV_SECRET = "dev-only-secret-change-me-in-production-0123456789"

export function sessionSecret(
  env: Record<string, string | undefined> = process.env
) {
  const secret = env.SESSION_SECRET
  if (secret) return new TextEncoder().encode(secret)
  if (env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET must be set in production")
  }
  return new TextEncoder().encode(DEV_SECRET)
}

export function signSession(payload: SessionPayload, secret: Uint8Array) {
  return new SignJWT({ user: payload.user })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secret)
}

/** The session in `token`, or null when it is missing, forged or expired. */
export async function verifySession(
  token: string | undefined,
  secret: Uint8Array
): Promise<SessionPayload | null> {
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, secret, {
      algorithms: ["HS256"],
    })
    return typeof payload.user === "string" ? { user: payload.user } : null
  } catch {
    return null
  }
}
