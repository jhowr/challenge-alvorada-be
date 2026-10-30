"use client"

import { CircleAlert, CircleCheck, CircleX, Sparkles } from "lucide-react"
import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { createBookingAction } from "@/features/bookings/actions"
import {
  describeDetails,
  describeError,
  fieldErrors,
} from "@/features/bookings/errors"
import type {
  ApiError,
  ApiResult,
  Availability,
} from "@/features/bookings/types"
import { formatPeriod, formatRaw, hourToDate } from "@/lib/hours"
import { cn } from "@/lib/utils"
import type { Selection } from "./day-grid"
import { HourPicker } from "./hour-picker"

export function suggestId(selection: Selection): string {
  const date = hourToDate(selection.start)
  const mm = String(date.getMonth() + 1).padStart(2, "0")
  const dd = String(date.getDate()).padStart(2, "0")
  const hh = String(date.getHours()).padStart(2, "0")
  return `${selection.resourceId.toLowerCase()}-${mm}${dd}-${hh}h`
}

export function BookingPanel({
  resources,
  selection,
  availability,
  checking,
  onChange,
}: {
  resources: string[]
  selection: Selection
  availability: ApiResult<Availability> | null
  checking: boolean
  onChange: (selection: Selection) => void
}) {
  const [id, setId] = useState("")
  const [error, setError] = useState<ApiError | null>(null)
  const [pending, startTransition] = useTransition()
  const fields = error ? fieldErrors(error) : {}
  const queryFields =
    availability && !availability.ok ? fieldErrors(availability.error) : {}
  const busy = availability?.ok && !availability.data.available
  const effectiveId = id || suggestId(selection)

  function submit(event: React.FormEvent) {
    event.preventDefault()
    startTransition(async () => {
      const result = await createBookingAction({
        id: effectiveId,
        ...selection,
      })
      if (result.ok) {
        setError(null)
        setId("")
        toast.success(`${result.data.id} reservada.`, {
          description: `${result.data.resourceId} · ${formatPeriod(result.data.start, result.data.end)}`,
        })
      } else {
        setError(result.error)
      }
    })
  }

  const items = resources.map((r) => ({ value: r, label: r }))

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-5 rounded-xl border bg-card p-5"
      aria-labelledby="booking-panel-title"
    >
      <div className="flex flex-col gap-1">
        <h2 id="booking-panel-title" className="text-base font-semibold">
          Verificar e reservar
        </h2>
        <p className="text-sm text-muted-foreground">
          Arraste sobre as horas na grade ou ajuste abaixo. A API responde a
          cada mudança.
        </p>
      </div>

      <AvailabilityResult
        availability={availability}
        checking={checking}
        selection={selection}
      />

      <FieldGroup className="gap-4">
        <Field data-invalid={fields.resourceId ? true : undefined}>
          <FieldLabel htmlFor="resource">Recurso</FieldLabel>
          <Select
            items={items}
            value={selection.resourceId}
            onValueChange={(value) =>
              value && onChange({ ...selection, resourceId: value })
            }
          >
            <SelectTrigger id="resource" className="w-full font-mono">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {items.map((item) => (
                  <SelectItem
                    key={item.value}
                    value={item.value}
                    className="font-mono"
                  >
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <Field
          data-invalid={fields.start || queryFields.start ? true : undefined}
        >
          <FieldLabel htmlFor="start">Início</FieldLabel>
          <HourPicker
            id="start"
            value={selection.start}
            onChange={(start) => onChange({ ...selection, start })}
            invalid={Boolean(fields.start || queryFields.start)}
          />
          <FieldDescription className="font-mono text-xs">
            start = {selection.start}
          </FieldDescription>
          <FieldError>{fields.start ?? queryFields.start}</FieldError>
        </Field>
        <Field data-invalid={fields.end || queryFields.end ? true : undefined}>
          <FieldLabel htmlFor="end">Fim</FieldLabel>
          <HourPicker
            id="end"
            value={selection.end}
            onChange={(end) => onChange({ ...selection, end })}
            invalid={Boolean(fields.end || queryFields.end)}
          />
          <FieldDescription className="font-mono text-xs">
            end = {selection.end} · a hora do fim fica livre
          </FieldDescription>
          <FieldError>{fields.end ?? queryFields.end}</FieldError>
        </Field>
        <Field
          data-invalid={
            fields.id || error?.code === "id_already_used" ? true : undefined
          }
        >
          <FieldLabel htmlFor="booking-id">Id da reserva</FieldLabel>
          <Input
            id="booking-id"
            value={id}
            placeholder={suggestId(selection)}
            onChange={(event) => setId(event.target.value)}
            className="font-mono"
            maxLength={80}
            aria-invalid={
              fields.id || error?.code === "id_already_used" ? true : undefined
            }
          />
          <FieldDescription>
            Escolhido por você. Um id usado nunca volta a ficar livre, nem após
            cancelar.
          </FieldDescription>
          <FieldError>{fields.id}</FieldError>
        </Field>
      </FieldGroup>

      {error && <SubmitError error={error} />}

      <div className="flex flex-col gap-2">
        <Button
          type="submit"
          size="lg"
          className="w-full pressable"
          disabled={pending}
        >
          {pending ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <Sparkles data-icon="inline-start" />
          )}
          Reservar <span className="font-mono">{effectiveId}</span>
        </Button>
        {busy && (
          <p className="text-xs text-muted-foreground">
            O período está ocupado: a API deve recusar com{" "}
            <code className="font-mono">409 conflict</code>. Tente para ver a
            resposta.
          </p>
        )}
      </div>
    </form>
  )
}

function AvailabilityResult({
  availability,
  checking,
  selection,
}: {
  availability: ApiResult<Availability> | null
  checking: boolean
  selection: Selection
}) {
  const request = `GET /resources/${selection.resourceId}/availability?start=${selection.start}&end=${selection.end}`

  if (!availability) {
    return <Skeleton className="h-[88px] w-full rounded-lg" />
  }

  if (!availability.ok) {
    const details = describeDetails(availability.error)
    return (
      <Outcome
        tone="error"
        icon={CircleX}
        title="Consulta recusada"
        code={`${availability.status} ${availability.error.code}`}
        request={request}
        checking={checking}
      >
        {details.length
          ? details.join(" · ")
          : describeError(availability.error)}
      </Outcome>
    )
  }

  const { available, conflicts } = availability.data
  if (available) {
    return (
      <Outcome
        tone="free"
        icon={CircleCheck}
        title="Livre"
        code="200 available: true"
        request={request}
        checking={checking}
      >
        Nenhuma reserva ativa em {formatPeriod(selection.start, selection.end)}.
      </Outcome>
    )
  }
  return (
    <Outcome
      tone="conflict"
      icon={CircleAlert}
      title={`Ocupado · ${conflicts.length} ${conflicts.length === 1 ? "conflito" : "conflitos"}`}
      code="200 available: false"
      request={request}
      checking={checking}
    >
      <ul className="mt-1 flex flex-col gap-1">
        {conflicts.map((booking) => (
          <li
            key={booking.id}
            className="flex flex-wrap items-baseline justify-between gap-x-3"
          >
            <span className="font-mono font-medium">{booking.id}</span>
            <span className="text-xs tabular-nums">
              {formatPeriod(booking.start, booking.end)}{" "}
              <span className="font-mono opacity-75">
                {formatRaw(booking.start, booking.end)}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </Outcome>
  )
}

const TONES = {
  free: "border-free/30 bg-free-surface text-free",
  conflict: "border-conflict/35 bg-conflict-surface text-conflict",
  error: "border-destructive/30 bg-destructive/8 text-destructive",
}

function Outcome({
  tone,
  icon: Icon,
  title,
  code,
  request,
  checking,
  children,
}: {
  tone: keyof typeof TONES
  icon: typeof CircleCheck
  title: string
  code: string
  request: string
  checking: boolean
  children: React.ReactNode
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex flex-col gap-1 rounded-lg border p-3 text-sm transition-[opacity,background-color,border-color,color] duration-200",
        TONES[tone],
        checking && "opacity-70"
      )}
    >
      <div className="flex items-center gap-2">
        <Icon className="size-4 shrink-0" aria-hidden />
        <span className="font-semibold">{title}</span>
        {checking && <Spinner className="ml-auto size-3.5" />}
      </div>
      <div className="text-foreground/85">{children}</div>
      <div className="mt-1 flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
        <code className="min-w-0 truncate" title={request}>
          {request}
        </code>
        <code className="ml-auto shrink-0 whitespace-nowrap">→ {code}</code>
      </div>
    </div>
  )
}

function SubmitError({ error }: { error: ApiError }) {
  return (
    <div
      role="alert"
      className="flex flex-col gap-1 rounded-lg border border-destructive/30 bg-destructive/8 p-3 text-sm"
    >
      <div className="flex items-center gap-2 text-destructive">
        <CircleX className="size-4 shrink-0" aria-hidden />
        <span className="font-semibold">Reserva recusada</span>
        <code className="ml-auto font-mono text-[11px]">{error.code}</code>
      </div>
      <p className="text-foreground/85">{describeError(error)}</p>
    </div>
  )
}
