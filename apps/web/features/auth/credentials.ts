import { timingSafeEqual } from "node:crypto"

/** One demo account, configurable by env. Defaults are printed on the login page in dev. */
export const DEMO_USER = "avaliador"
export const DEMO_PASSWORD = "alvorada"

export function panelCredentials(
  env: Record<string, string | undefined> = process.env
) {
  return {
    user: env.PANEL_USER || DEMO_USER,
    password: env.PANEL_PASSWORD || DEMO_PASSWORD,
  }
}

export function checkCredentials(
  user: string,
  password: string,
  expected = panelCredentials()
): boolean {
  // Both comparisons always run, so a wrong user and a wrong password take the same time.
  const userOk = safeEqual(user, expected.user)
  const passwordOk = safeEqual(password, expected.password)
  return userOk && passwordOk
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  // timingSafeEqual needs equal lengths; compare against itself to keep the timing.
  if (left.length !== right.length) {
    timingSafeEqual(right, right)
    return false
  }
  return timingSafeEqual(left, right)
}
