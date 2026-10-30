"use server"

import { redirect } from "next/navigation"
import { checkCredentials } from "./credentials"
import { createSession, deleteSession } from "./session"

export type LoginState = { error?: string; user?: string } | undefined

export async function login(
  _state: LoginState,
  form: FormData
): Promise<LoginState> {
  const user = String(form.get("user") ?? "").trim()
  const password = String(form.get("password") ?? "")
  if (!user || !password) {
    return { error: "Informe usuário e senha.", user }
  }
  if (!checkCredentials(user, password)) {
    return { error: "Usuário ou senha incorretos.", user }
  }
  await createSession(user)
  redirect(safeNext(form.get("next")))
}

export async function logout() {
  await deleteSession()
  redirect("/login")
}

/** Only same-app paths: `//evil.com` or `https://…` fall back to the agenda. */
function safeNext(value: FormDataEntryValue | null): string {
  const next = typeof value === "string" ? value : ""
  return next.startsWith("/") && !next.startsWith("//") ? next : "/"
}
