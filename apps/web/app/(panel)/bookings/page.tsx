import type { Metadata } from "next"
import { requireSession } from "@/features/auth/session"
import * as api from "@/features/bookings/api"
import { BookingsTable } from "@/features/bookings/bookings-table"
import type { BookingStatus } from "@/features/bookings/types"
import { ApiDown } from "@/features/shell/api-down"
import { Page, PageHeader } from "@/features/shell/page"

export const metadata: Metadata = { title: "Reservas" }

const STATUSES: BookingStatus[] = ["active", "cancelled"]

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; resource?: string }>
}) {
  await requireSession()
  const params = await searchParams
  // Filters go to the API as-is, so the list is exactly what GET /bookings returns.
  const status = STATUSES.find((s) => s === params.status)
  const [resources, bookings] = await Promise.all([
    api.listResources(),
    api.listBookings({ status, resourceId: params.resource || undefined }),
  ])
  if (!resources.ok) return <ApiDown error={resources.error} />
  if (!bookings.ok) return <ApiDown error={bookings.error} />

  return (
    <Page>
      <PageHeader
        title="Reservas"
        description="Todas as reservas, na ordem da API: id crescente pela ordem dos bytes, igual em memória e no Postgres."
      />
      <BookingsTable
        bookings={bookings.data}
        resources={resources.data}
        status={status ?? ""}
        resource={params.resource ?? ""}
      />
    </Page>
  )
}
