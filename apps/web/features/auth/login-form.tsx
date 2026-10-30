"use client"

import { useActionState } from "react"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { login, type LoginState } from "./actions"

export function LoginForm({
  next,
  demo,
}: {
  next?: string
  demo?: { user: string; password: string }
}) {
  const [state, action, pending] = useActionState<LoginState, FormData>(
    login,
    undefined
  )

  return (
    <form action={action} className="flex w-full max-w-sm flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-semibold">Entrar</h2>
        <p className="text-sm text-muted-foreground">
          Acesso de demonstração ao painel de reservas.
        </p>
      </div>
      <input type="hidden" name="next" value={next ?? "/"} />
      <FieldGroup>
        <Field data-invalid={state?.error ? true : undefined}>
          <FieldLabel htmlFor="user">Usuário</FieldLabel>
          <Input
            id="user"
            name="user"
            autoComplete="username"
            defaultValue={state?.user ?? demo?.user}
            aria-invalid={state?.error ? true : undefined}
            required
          />
        </Field>
        <Field data-invalid={state?.error ? true : undefined}>
          <FieldLabel htmlFor="password">Senha</FieldLabel>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            aria-invalid={state?.error ? true : undefined}
            autoFocus={Boolean(demo)}
            required
          />
          {state?.error && (
            <FieldDescription role="alert" className="text-destructive">
              {state.error}
            </FieldDescription>
          )}
        </Field>
      </FieldGroup>
      <Button
        type="submit"
        size="lg"
        className="w-full pressable"
        disabled={pending}
      >
        {pending && <Spinner data-icon="inline-start" />}
        {pending ? "Entrando…" : "Entrar"}
      </Button>
      {demo && (
        <p className="text-xs text-muted-foreground">
          Demonstração: usuário <code className="font-mono">{demo.user}</code>,
          senha <code className="font-mono">{demo.password}</code>. Defina{" "}
          <code className="font-mono">PANEL_USER</code> e{" "}
          <code className="font-mono">PANEL_PASSWORD</code> para trocar.
        </p>
      )}
    </form>
  )
}
