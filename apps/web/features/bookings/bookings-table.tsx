"use client"

import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CalendarRange,
  CalendarX2,
  MoreHorizontal,
  Search,
  X,
} from "lucide-react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  formatDateTime,
  formatDuration,
  formatRaw,
  hourToDate,
  toDayParam,
} from "@/lib/hours"
import { CancelBookingDialog } from "./cancel-booking-dialog"
import { FacetedFilter } from "./faceted-filter"
import { StatusBadge } from "./status-badge"
import type { Booking } from "./types"
import { cn } from "@/lib/utils"

type SortKey = "start" | "end"

export function BookingsTable({
  bookings,
  resources,
  status,
  resource,
}: {
  bookings: Booking[]
  resources: string[]
  status: string
  resource: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [search, setSearch] = useState("")
  // No sort means the API's own order (ascending id, byte order).
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean } | null>(null)
  const [cancelling, setCancelling] = useState<Booking | null>(null)

  const setFilter = (key: "status" | "resource", value: string) => {
    const query = new URLSearchParams()
    const next = { status, resource, [key]: value }
    if (next.status) query.set("status", next.status)
    if (next.resource) query.set("resource", next.resource)
    router.push(query.size ? `${pathname}?${query}` : pathname)
  }

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    const filtered = q
      ? bookings.filter((b) => b.id.toLowerCase().includes(q))
      : bookings
    if (!sort) return filtered
    return [...filtered].sort((a, b) =>
      sort.desc ? b[sort.key] - a[sort.key] : a[sort.key] - b[sort.key]
    )
  }, [bookings, search, sort])

  const toggleSort = (key: SortKey) =>
    setSort((s) =>
      s?.key !== key
        ? { key, desc: false }
        : s.desc
          ? null
          : { key, desc: true }
    )
  const filtering = Boolean(status || resource || search)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por id…"
            className="h-7 pl-8"
            aria-label="Buscar por id"
          />
        </div>
        <FacetedFilter
          title="Status"
          value={status}
          onChange={(value) => setFilter("status", value)}
          options={[
            { value: "active", label: "ativa" },
            { value: "cancelled", label: "cancelada" },
          ]}
        />
        <FacetedFilter
          title="Recurso"
          value={resource}
          onChange={(value) => setFilter("resource", value)}
          options={resources.map((r) => ({ value: r, label: r, mono: true }))}
        />
        {filtering && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch("")
              router.push(pathname)
            }}
          >
            Limpar
            <X data-icon="inline-end" />
          </Button>
        )}
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
          {rows.length} de {bookings.length}
        </span>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="h-10 pl-4 text-xs">Id</TableHead>
              <TableHead className="h-10 text-xs">Recurso</TableHead>
              <SortableHead
                label="Início"
                active={sort?.key === "start" ? sort : null}
                onClick={() => toggleSort("start")}
              />
              <SortableHead
                label="Fim"
                active={sort?.key === "end" ? sort : null}
                onClick={() => toggleSort("end")}
                className="hidden md:table-cell"
              />
              <TableHead className="hidden h-10 text-right text-xs lg:table-cell">
                Duração
              </TableHead>
              <TableHead className="hidden h-10 text-xs lg:table-cell">
                Inteiros
              </TableHead>
              <TableHead className="h-10 text-xs">Status</TableHead>
              <TableHead className="h-10 w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((booking) => (
              <TableRow
                key={booking.id}
                className={
                  booking.status === "cancelled"
                    ? "text-muted-foreground"
                    : undefined
                }
              >
                <TableCell className="pl-4 font-mono font-medium">
                  {booking.id}
                </TableCell>
                <TableCell className="font-mono text-[13px]">
                  {booking.resourceId}
                </TableCell>
                <TableCell>{formatDateTime(booking.start)}</TableCell>
                <TableCell className="hidden md:table-cell">
                  {formatDateTime(booking.end)}
                </TableCell>
                <TableCell className="hidden text-right lg:table-cell">
                  {formatDuration(booking.start, booking.end)}
                </TableCell>
                <TableCell className="hidden font-mono text-xs text-muted-foreground lg:table-cell">
                  {formatRaw(booking.start, booking.end)}
                </TableCell>
                <TableCell>
                  <StatusBadge status={booking.status} />
                </TableCell>
                <TableCell className="pr-3">
                  <RowActions
                    booking={booking}
                    onCancel={() => setCancelling(booking)}
                  />
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={8}>
                  <EmptyBookings filtering={filtering} />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <CancelBookingDialog
        booking={cancelling}
        onOpenChange={(open) => !open && setCancelling(null)}
      />
    </div>
  )
}

function SortableHead({
  label,
  active,
  onClick,
  className,
}: {
  label: string
  active: { desc: boolean } | null
  onClick: () => void
  className?: string
}) {
  const Icon = !active ? ArrowUpDown : active.desc ? ArrowDown : ArrowUp
  return (
    <TableHead
      className={cn("h-10 text-xs", className)}
      aria-sort={!active ? "none" : active.desc ? "descending" : "ascending"}
    >
      <button
        type="button"
        onClick={onClick}
        className="-ml-1 inline-flex items-center gap-1 rounded px-1 py-0.5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        {label}
        <Icon className={cn("size-3.5", !active && "opacity-40")} aria-hidden />
      </button>
    </TableHead>
  )
}

function RowActions({
  booking,
  onCancel,
}: {
  booking: Booking
  onCancel: () => void
}) {
  const query = new URLSearchParams({
    day: toDayParam(hourToDate(booking.start)),
    resource: booking.resourceId,
  })
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Ações de ${booking.id}`}
          />
        }
      >
        <MoreHorizontal />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuGroup>
          <DropdownMenuItem render={<Link href={`/?${query}`} />}>
            <CalendarRange />
            Ver na agenda
          </DropdownMenuItem>
        </DropdownMenuGroup>
        {booking.status === "active" && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem variant="destructive" onClick={onCancel}>
                <CalendarX2 />
                Cancelar
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function EmptyBookings({ filtering }: { filtering: boolean }) {
  return (
    <Empty className="py-10">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <CalendarRange />
        </EmptyMedia>
        <EmptyTitle>
          {filtering ? "Nada com esses filtros" : "Nenhuma reserva ainda"}
        </EmptyTitle>
        <EmptyDescription>
          {filtering
            ? "Tente outro status ou recurso, ou limpe os filtros."
            : "Crie a primeira na Agenda, arrastando sobre as horas de um recurso."}
        </EmptyDescription>
      </EmptyHeader>
      {!filtering && (
        <EmptyContent>
          <Button render={<Link href="/" />} variant="outline">
            Abrir a Agenda
          </Button>
        </EmptyContent>
      )}
    </Empty>
  )
}
