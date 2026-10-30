import type { Metadata } from "next"
import { panelCredentials } from "@/features/auth/credentials"
import { LoginForm } from "@/features/auth/login-form"
import { BrandMark } from "@/features/shell/brand-mark"

export const metadata: Metadata = { title: "Entrar" }

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const { next } = await searchParams
  // The demo credentials are printed only outside production.
  const demo =
    process.env.NODE_ENV === "production" ? undefined : panelCredentials()

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-sidebar p-12 text-sidebar-foreground lg:flex">
        <div className="flex items-center gap-3 text-sidebar-accent-foreground">
          <BrandMark />
          <span className="font-semibold">Reservas</span>
        </div>
        <div className="flex max-w-md flex-col gap-4">
          <h1 className="text-4xl font-semibold text-sidebar-accent-foreground">
            Duas reservas ativas do mesmo recurso nunca se sobrepõem.
          </h1>
          <p>
            Consulte a disponibilidade, reserve, cancele e veja cada regra da
            API responder, com o código de erro e as reservas em conflito.
          </p>
        </div>
        <p className="text-xs">Caso 02 · Desafio técnico Alvorada</p>
        <HourRuler />
      </aside>
      <main className="flex items-center justify-center p-6">
        <LoginForm next={next} demo={demo} />
      </main>
    </div>
  )
}

/**
 * The panel's signature in miniature: two adjacent bookings that do not
 * conflict, and a queried period (violet) that overlaps both.
 */
function HourRuler() {
  const hours = [8, 9, 10, 11, 12, 13]
  return (
    <svg
      aria-hidden
      viewBox="0 0 360 96"
      className="pointer-events-none absolute right-12 bottom-28 w-[360px] opacity-90"
    >
      {hours.map((h, i) => (
        <g key={h}>
          <line
            x1={i * 60}
            x2={i * 60}
            y1={20}
            y2={88}
            stroke="rgb(255 255 255 / 0.12)"
          />
          <text
            x={i * 60 + 4}
            y={12}
            fill="rgb(255 255 255 / 0.45)"
            fontSize="10"
          >
            {String(h).padStart(2, "0")}:00
          </text>
        </g>
      ))}
      <rect
        x={62}
        y={34}
        width={116}
        height={40}
        rx={6}
        fill="rgb(255 255 255 / 0.1)"
        stroke="rgb(255 255 255 / 0.25)"
      />
      <text x={72} y={58} fill="rgb(255 255 255 / 0.8)" fontSize="11">
        standup
      </text>
      <rect
        x={182}
        y={34}
        width={56}
        height={40}
        rx={6}
        fill="rgb(255 255 255 / 0.1)"
        stroke="rgb(255 255 255 / 0.25)"
      />
      <text x={190} y={58} fill="rgb(255 255 255 / 0.8)" fontSize="11">
        review
      </text>
      <rect
        x={118}
        y={28}
        width={122}
        height={52}
        rx={8}
        fill="var(--sidebar-ring)"
        fillOpacity={0.14}
        stroke="var(--sidebar-ring)"
        strokeWidth={2}
      />
    </svg>
  )
}
