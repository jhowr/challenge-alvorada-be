import type { Metadata } from "next"
import { requireSession } from "@/features/auth/session"
import * as api from "@/features/bookings/api"
import { Agenda } from "@/features/agenda/agenda"
import { overlaps } from "@/features/agenda/grid"
import { ApiDown } from "@/features/shell/api-down"
import { dayRange, hourOf, parseDayParam, toDayParam } from "@/lib/hours"

export const metadata: Metadata = { title: "Agenda" }

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<{ day?: string; resource?: string }>
}) {
  await requireSession()
  const params = await searchParams
  const today = new Date()
  const date = parseDayParam(params.day, today)
  const day = dayRange(date)

  const [resources, bookings] = await Promise.all([
    api.listResources(),
    api.listBookings({}),
  ])
  if (!resources.ok) return <ApiDown error={resources.error} />
  if (!bookings.ok) return <ApiDown error={bookings.error} />

  const dayParam = toDayParam(date)
  const focusedResource = resources.data.includes(params.resource ?? "")
    ? params.resource
    : undefined

  return (
    <Agenda
      key={`${dayParam}-${focusedResource ?? ""}`}
      dayParam={dayParam}
      isToday={dayParam === toDayParam(today)}
      day={day}
      resources={resources.data}
      bookings={bookings.data.filter((booking) => overlaps(booking, day))}
      focusedResource={focusedResource}
      now={hourOf(today)}
    />
  )
}
