import { SignJWT } from "jose"
import { checkCredentials } from "./credentials"
import { sessionSecret, signSession, verifySession } from "./session-token"

const secret = new TextEncoder().encode("a-test-secret-with-enough-length-000")

describe("session token", () => {
  it("round-trips the user", async () => {
    const token = await signSession({ user: "avaliador" }, secret)
    expect(await verifySession(token, secret)).toEqual({ user: "avaliador" })
  })

  it("rejects a token signed with another secret", async () => {
    const other = new TextEncoder().encode("another-secret-with-enough-len-111")
    const token = await signSession({ user: "avaliador" }, other)
    expect(await verifySession(token, secret)).toBeNull()
  })

  it("rejects an expired token", async () => {
    const token = await new SignJWT({ user: "avaliador" })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(secret)
    expect(await verifySession(token, secret)).toBeNull()
  })

  it.each([undefined, "", "not-a-jwt"])("rejects %j", async (token) => {
    expect(await verifySession(token, secret)).toBeNull()
  })

  it("refuses to run in production without SESSION_SECRET", () => {
    expect(() => sessionSecret({ NODE_ENV: "production" })).toThrow(
      "SESSION_SECRET"
    )
  })
})

describe("checkCredentials", () => {
  const expected = { user: "avaliador", password: "alvorada" }

  it("accepts the configured pair", () => {
    expect(checkCredentials("avaliador", "alvorada", expected)).toBe(true)
  })

  it.each([
    ["avaliador", "errada"],
    ["outro", "alvorada"],
    ["", ""],
    ["avaliador", "alvorada "],
  ])("rejects %j / %j", (user, password) => {
    expect(checkCredentials(user, password, expected)).toBe(false)
  })
})
